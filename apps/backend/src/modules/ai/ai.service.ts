import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { randomUUID } from 'node:crypto';
import { Security } from '../../common/utils/security';
import { RecruitingService } from '../recruiting/recruiting.service';
import { vacancyBrief } from '../../common/pipes/validation';
import { vacancyDraftSchema } from './schemas/vacancy.schema';
import { resumeSchema } from './schemas/resume.schema';
import { evidenceSchema, validateEvidence } from './schemas/evidence.schema';
import { questionsSchema } from './schemas/questions.schema';
import { vacancyInstructions } from './prompts/vacancy.prompt';
import { instructions } from './prompts/evidence.prompt';
import { GeminiProvider } from './providers/gemini.provider';
import { ResumeQueueService } from '../resumes/resume-queue.service';
import { NotificationService } from '../notifications/notification.service';

export {
  vacancyDraftSchema,
  resumeSchema,
  evidenceSchema,
  questionsSchema,
  validateEvidence,
};

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private geminiProvider: GeminiProvider;

  constructor(
    @Inject(Security) private security: Security,
    @Inject(RecruitingService) private recruiting: RecruitingService,
    @Optional() @Inject(GeminiProvider) geminiProvider?: GeminiProvider,
    @Optional() @Inject(ResumeQueueService) private resumeQueue?: ResumeQueueService,
    @Optional() @Inject(NotificationService) private notifications?: NotificationService,
  ) {
    this.geminiProvider = geminiProvider ?? new GeminiProvider(this.security);
  }

  onModuleInit() {
    this.resumeQueue?.registerWorker(async (data) => {
      await this.parse(data.companyId, data.candidateId, data.userId);
    });
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
    if (candidate.publicSubmittedAt && !candidate.aiConsentAt)
      throw new ForbiddenException('Candidate did not opt in to AI analysis');
    if (!candidate.resumeText) throw new BadRequestException('Upload a CV first');

    await this.resumeQueue?.setProgress(companyId, candidateId, {
      status: 'EXTRACTING',
      step: 1,
      totalSteps: 4,
      message: "Matn o'qildi va kontaktlar ajratilmoqda…",
      percent: 25,
    });

    return this.locked(`candidate:${companyId}:${candidateId}`, userId, async () => {
      try {
        await this.resumeQueue?.setProgress(companyId, candidateId, {
          status: 'PARSING',
          step: 2,
          totalSteps: 4,
          message: "Ko'nikmalar va texnologiyalar aniqlanmoqda…",
          percent: 60,
        });

        const result = await this.generate(
          resumeSchema,
          'Extract factual structured resume information. Do not extract contact details, age, gender, ethnicity, photos or other sensitive attributes.',
          { cv: candidate.resumeText },
        );

        await this.resumeQueue?.setProgress(companyId, candidateId, {
          status: 'STRUCTURING',
          step: 3,
          totalSteps: 4,
          message: "Ish tajribasi va ta'lim tahlil qilinmoqda…",
          percent: 85,
        });

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

        await this.resumeQueue?.setProgress(companyId, candidateId, {
          status: 'COMPLETED',
          step: 4,
          totalSteps: 4,
          message: "Rezyume to'liq tahlil qilindi!",
          percent: 100,
        });

        return result;
      } catch (err: any) {
        await this.resumeQueue?.setProgress(companyId, candidateId, {
          status: 'FAILED',
          step: 0,
          totalSteps: 4,
          message: err?.message || 'Tahlil jarayonida xatolik yuz berdi',
          percent: 0,
          error: err?.message,
        });
        throw err;
      }
    });
  }

  async parseAsync(companyId: number, candidateId: number, userId: number) {
    const candidate = await this.recruiting.candidate(companyId, candidateId);
    if (candidate.publicSubmittedAt && !candidate.aiConsentAt)
      throw new ForbiddenException('Candidate did not opt in to AI analysis');
    if (!candidate.resumeText) throw new BadRequestException('Upload a CV first');

    await this.resumeQueue?.setProgress(companyId, candidateId, {
      status: 'PENDING',
      step: 1,
      totalSteps: 4,
      message: "Navbatga qo'yildi va tahlilga tayyorlanmoqda…",
      percent: 10,
    });

    const queued = await this.resumeQueue?.addJob({ companyId, candidateId, userId });
    if (!queued) {
      setImmediate(async () => {
        try {
          await this.parse(companyId, candidateId, userId);
        } catch (err: any) {
          this.logger.error(`Async parse failed: ${err?.message}`);
        }
      });
    }

    return { queued: true, candidateId, status: 'PENDING' };
  }

  async getParseStatus(companyId: number, candidateId: number) {
    const progress = await this.resumeQueue?.getProgress(companyId, candidateId);
    return progress ?? { status: 'PENDING', step: 0, totalSteps: 4, message: '', percent: 0 };
  }

  async analyze(companyId: number, applicationId: number, userId: number, questions = false) {
    const app = await this.recruiting.application(companyId, applicationId);
    if (app.candidate.publicSubmittedAt && !app.candidate.aiConsentAt)
      throw new ForbiddenException('Candidate did not opt in to AI analysis');
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

      if (
        !questions &&
        this.notifications &&
        result &&
        typeof result === 'object' &&
        'requirements' in result
      ) {
        const reqs = (result as { requirements: Array<{ status: string }> }).requirements;
        if (reqs.length > 0) {
          const supported = reqs.filter((r) => r.status === 'SUPPORTED').length;
          const partial = reqs.filter((r) => r.status === 'PARTIAL').length;
          const notFound = reqs.filter((r) => r.status === 'NOT_FOUND').length;
          const matchPercentage = Math.round(((supported + partial * 0.5) / reqs.length) * 100);

          if (matchPercentage >= 85) {
            void this.notifications.notifyRecruitersStrongCandidate({
              applicationId,
              companyId,
              candidate: app.candidate,
              vacancy: app.vacancy,
              matchPercentage,
              supported,
              partial,
              notFound,
              total: reqs.length,
            });
          }
        }
      }

      return result;
    });
  }
}
