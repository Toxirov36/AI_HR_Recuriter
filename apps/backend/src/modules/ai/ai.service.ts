import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { randomUUID } from 'node:crypto';
import { Security } from '../../common/utils/security';
import { RecruitingService } from '../../recruiting.service';
import { vacancyBrief } from '../../common/pipes/validation';
import { vacancyDraftSchema } from './schemas/vacancy.schema';
import { resumeSchema } from './schemas/resume.schema';
import { evidenceSchema, validateEvidence } from './schemas/evidence.schema';
import { questionsSchema } from './schemas/questions.schema';
import { vacancyInstructions } from './prompts/vacancy.prompt';
import { instructions } from './prompts/evidence.prompt';
import { GeminiProvider } from './providers/gemini.provider';

export {
  vacancyDraftSchema,
  resumeSchema,
  evidenceSchema,
  questionsSchema,
  validateEvidence,
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private geminiProvider: GeminiProvider;

  constructor(
    @Inject(Security) private security: Security,
    @Inject(RecruitingService) private recruiting: RecruitingService,
    @Optional() @Inject(GeminiProvider) geminiProvider?: GeminiProvider,
  ) {
    this.geminiProvider = geminiProvider ?? new GeminiProvider(this.security);
  }

  async generateVacancy(companyId: number, userId: number, input: z.infer<typeof vacancyBrief>) {
    const language = { uz: 'Uzbek (Latin script)', en: 'English', ru: 'Russian' }[input.language];
    return this.locked(`vacancy-draft:${companyId}:${userId}`, userId, () =>
      this.generate(
        vacancyDraftSchema,
        `Create a complete job description draft in ${language}. Keep technical names such as NestJS unchanged.`,
        { brief: input.brief },
        vacancyInstructions,
      ),
    );
  }

  private async generate<T extends z.ZodType>(
    schema: T,
    task: string,
    input: unknown,
    systemInstructions = instructions,
  ): Promise<z.infer<T>> {
    return this.geminiProvider.generate(schema, task, input, systemInstructions);
  }

  private async request(
    model: string,
    method: 'generateContent' | 'embedContent',
    body: unknown,
  ): Promise<unknown> {
    return this.geminiProvider.request(model, method, body);
  }

  private async embed(resume: z.infer<typeof resumeSchema>) {
    return this.geminiProvider.embed(resume);
  }

  private async locked<T>(key: string, userId: number, work: () => Promise<T>) {
    if (!this.security.config.GEMINI_API_KEY)
      throw new ServiceUnavailableException(
        'AI is not configured. Set GEMINI_API_KEY on the backend to enable this feature.',
      );
    await this.security.limit(`ai:${userId}`, 10, 600);
    const lock = `ai-lock:${key}`;
    const token = randomUUID();
    if (
      !(await this.security.redis.set(
        lock,
        token,
        'PX',
        this.security.config.AI_TIMEOUT_MS * 2 + 30000,
        'NX',
      ))
    )
      throw new ConflictException('AI processing is already running for this record');
    try {
      return await work();
    } finally {
      await this.security.redis
        .eval(
          'if redis.call("GET",KEYS[1]) == ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end',
          1,
          lock,
          token,
        )
        .catch(() => {});
    }
  }

  async parse(companyId: number, candidateId: number, userId: number) {
    const candidate = await this.recruiting.candidate(companyId, candidateId);
    if (!candidate.resumeText) throw new BadRequestException('Upload a CV first');
    return this.locked(`candidate:${companyId}:${candidateId}`, userId, async () => {
      const result = await this.generate(
        resumeSchema,
        'Extract factual structured resume information. Do not extract contact details, age, gender, ethnicity, photos or other sensitive attributes.',
        { cv: candidate.resumeText },
      );
      const embedding = await this.embed(result);
      const updated = await this.recruiting.db.candidate.updateMany({
        where: { id: candidateId, companyId, resumeRevision: candidate.resumeRevision },
        data: {
          parsedResume: { ...result, embedding },
          skills: result.skills,
          experience: result.experience,
          education: result.education,
          languages: result.languages,
        },
      });
      if (!updated.count)
        throw new ConflictException('The CV changed during processing. Retry with the current CV.');
      return result;
    });
  }

  async analyze(companyId: number, applicationId: number, userId: number, questions = false) {
    const app = await this.recruiting.application(companyId, applicationId);
    if (!app.candidate.resumeText) throw new BadRequestException('Upload a CV first');
    if (!app.vacancy.requirements.length)
      throw new BadRequestException('Add vacancy requirements first');
    return this.locked(`application:${companyId}:${applicationId}`, userId, async () => {
      const input = {
        cv: app.candidate.resumeText,
        vacancy: {
          title: app.vacancy.title,
          description: app.vacancy.description,
          requirements: app.vacancy.requirements.map(({ id, name, description, required }) => ({
            id,
            name,
            description,
            required,
          })),
        },
      };
      let data: Prisma.ApplicationUpdateManyMutationInput;
      let result: unknown;
      if (questions) {
        const generated = await this.generate(
          questionsSchema,
          'Generate 5 to 8 open-ended job-related interview questions. Clarify gaps and verify experience without assuming missing evidence means lack of ability. Only use supplied requirement IDs or null for a general job-related question.',
          input,
        );
        if (
          generated.questions.length < 5 ||
          generated.questions.length > 8 ||
          generated.questions.some(
            (q) =>
              q.requirementId !== null &&
              !app.vacancy.requirements.some((r) => r.id === q.requirementId),
          )
        )
          throw new BadGatewayException('Invalid interview questions. Retry generation.');
        result = generated;
        data = { interviewQuestions: generated };
      } else {
        const generated = await this.generate(
          evidenceSchema,
          'Return exactly one entry per requirement ID. SUPPORTED means explicit CV evidence covers the requirement, PARTIAL means some aspects have evidence, NOT_FOUND means no relevant statement appears, UNKNOWN means ambiguous or not assessable from a CV. For SUPPORTED and PARTIAL include exact verbatim quotes copied from the CV. Explain the factual evidence or uncertainty. For sensitive, discriminatory or non-job-related requirements use UNKNOWN without assessment.',
          input,
        );
        const verified = validateEvidence(
          generated,
          app.vacancy.requirements,
          app.candidate.resumeText!,
        );
        result = verified;
        data = {
          analysis: verified,
          analyzedResumeRevision: app.candidate.resumeRevision,
          analyzedVacancyRevision: app.vacancy.revision,
        };
      }
      // Serializable check and write prevents saving AI results over a concurrently replaced CV/vacancy.
      await this.recruiting.db.$transaction(
        async (tx) => {
          const current = await tx.application.findFirst({
            where: { id: applicationId, companyId },
            select: {
              candidate: { select: { resumeRevision: true } },
              vacancy: { select: { revision: true } },
            },
          });
          if (
            !current ||
            current.candidate.resumeRevision !== app.candidate.resumeRevision ||
            current.vacancy.revision !== app.vacancy.revision
          )
            throw new ConflictException('CV or vacancy changed during processing. Retry.');
          await tx.application.updateMany({ where: { id: applicationId, companyId }, data });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return result;
    });
  }
}
