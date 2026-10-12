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
import { comparisonInstructions } from './prompts/comparison.prompt';
import { GeminiProvider } from './providers/gemini.provider';
import { ResumeQueueService } from '../resumes/resume-queue.service';
import { NotificationService } from '../notifications/notification.service';
import { calculateCandidateMatchScore } from './utils/matching-calculator';
import { topComparisonSchema, type TopComparisonResult } from './schemas/top-comparison.schema';

export {
  vacancyDraftSchema,
  resumeSchema,
  evidenceSchema,
  questionsSchema,
  validateEvidence,
  topComparisonSchema,
  calculateCandidateMatchScore,
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

  async analyzeVacancyApplications(companyId: number, vacancyId: number, userId: number) {
    const vacancy = await this.recruiting.vacancy(companyId, vacancyId);
    if (!vacancy.requirements.length) {
      throw new BadRequestException('Vakansiyada tahlil qilish uchun talablar mavjud emas');
    }

    const applications = await this.recruiting.db.application.findMany({
      where: { vacancyId, companyId },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            resumeText: true,
            resumeRevision: true,
            publicSubmittedAt: true,
            aiConsentAt: true,
          },
        },
      },
    });

    let analyzedCount = 0;
    let skippedCount = 0;
    const skippedDetails: Array<{ applicationId: number; candidateName: string; reason: string }> = [];

    for (const app of applications) {
      if (app.candidate.publicSubmittedAt && !app.candidate.aiConsentAt) {
        skippedCount++;
        skippedDetails.push({
          applicationId: app.id,
          candidateName: app.candidate.fullName,
          reason: 'Nomzod AI tahlili uchun rozilik bermagan',
        });
        continue;
      }

      if (!app.candidate.resumeText) {
        skippedCount++;
        skippedDetails.push({
          applicationId: app.id,
          candidateName: app.candidate.fullName,
          reason: 'Rezyume matni mavjud emas',
        });
        continue;
      }

      const needsAnalysis =
        !app.analysis ||
        app.analyzedResumeRevision !== app.candidate.resumeRevision ||
        app.analyzedVacancyRevision !== vacancy.revision;

      if (needsAnalysis) {
        try {
          await this.analyze(companyId, app.id, userId);
          analyzedCount++;
        } catch (err: any) {
          this.logger.warn(`Failed to analyze application ${app.id}: ${err?.message}`);
          skippedCount++;
          skippedDetails.push({
            applicationId: app.id,
            candidateName: app.candidate.fullName,
            reason: err?.message || 'Tahlil jarayonida xatolik',
          });
        }
      } else {
        analyzedCount++;
      }
    }

    return {
      vacancyId,
      totalApplications: applications.length,
      analyzedCount,
      skippedCount,
      skippedDetails,
      message: `${applications.length} ta nomzoddan ${analyzedCount} tasi tahlil qilindi`,
    };
  }

  async getVacancyTopCandidates(companyId: number, vacancyId: number, limit = 3) {
    const vacancy = await this.recruiting.vacancy(companyId, vacancyId);

    const applications = await this.recruiting.db.application.findMany({
      where: { vacancyId, companyId },
      include: {
        candidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            source: true,
            resumeName: true,
            resumeText: true,
            aiConsentAt: true,
            publicSubmittedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const scoredCandidates = applications.map((app) => {
      const score = calculateCandidateMatchScore(
        vacancy.requirements,
        app.analysis as any,
      );

      const isAnalyzed = Boolean(app.analysis);
      const hasConsent = !app.candidate.publicSubmittedAt || Boolean(app.candidate.aiConsentAt);
      const hasResume = Boolean(app.candidate.resumeText);

      return {
        applicationId: app.id,
        candidateId: app.candidate.id,
        candidateName: app.candidate.fullName,
        candidateEmail: app.candidate.email,
        candidatePhone: app.candidate.phone,
        candidateSource: app.candidate.source,
        currentStage: app.status,
        hasResume,
        hasConsent,
        isAnalyzed,
        matchScore: isAnalyzed ? score.matchScore : 0,
        mandatoryScore: isAnalyzed ? score.mandatoryScore : 0,
        optionalScore: isAnalyzed ? score.optionalScore : 0,
        supportedCount: score.supportedCount,
        partialCount: score.partialCount,
        notFoundCount: score.notFoundCount,
        unknownCount: score.unknownCount,
        strengths: score.strengths,
        gaps: score.gaps,
        partialMatches: score.partialMatches,
        requirementDetails: score.requirementDetails,
      };
    });

    // Rank: highest matchScore first, then highest mandatoryScore, then highest supportedCount
    const analyzedOnly = scoredCandidates.filter((c) => c.isAnalyzed);
    analyzedOnly.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      if (b.mandatoryScore !== a.mandatoryScore) return b.mandatoryScore - a.mandatoryScore;
      if (b.supportedCount !== a.supportedCount) return b.supportedCount - a.supportedCount;
      return a.applicationId - b.applicationId;
    });

    const topCandidates = analyzedOnly.slice(0, Math.max(1, limit)).map((c, idx) => ({
      ...c,
      rank: idx + 1,
    }));

    // AI comparison generation
    let comparison = this.buildFallbackComparison(vacancy.title, topCandidates);

    if (topCandidates.length > 0 && this.security.config.GEMINI_API_KEY) {
      try {
        const inputData = {
          vacancy: {
            title: vacancy.title,
            description: vacancy.description,
            requirements: vacancy.requirements.map((r) => ({
              id: r.id,
              name: r.name,
              required: r.required,
            })),
          },
          candidates: topCandidates.map((c) => ({
            candidateId: c.candidateId,
            rank: c.rank,
            name: c.candidateName,
            matchScore: c.matchScore,
            strengths: c.strengths,
            gaps: c.gaps,
            partialMatches: c.partialMatches,
          })),
        };

        const aiComparison = await this.generate(
          topComparisonSchema,
          `Ushbu top nomzodlarni o'zaro taqqoslab, HR mutaxassis uchun qisqa va professional xulosa tayyorlang.`,
          inputData,
          comparisonInstructions,
        );

        if (aiComparison && aiComparison.executiveSummary) {
          comparison = aiComparison;
        }
      } catch (err: any) {
        this.logger.warn(
          `AI Top Candidates comparison generation failed, using fallback: ${err?.message}`,
        );
      }
    }

    return {
      vacancy: {
        id: vacancy.id,
        title: vacancy.title,
        status: vacancy.status,
        requirementsCount: vacancy.requirements.length,
      },
      stats: {
        totalApplications: applications.length,
        analyzedCount: analyzedOnly.length,
        unanalyzedCount: applications.length - analyzedOnly.length,
        averageScore:
          analyzedOnly.length > 0
            ? Math.round(
                analyzedOnly.reduce((acc, c) => acc + c.matchScore, 0) / analyzedOnly.length,
              )
            : 0,
      },
      topCandidates,
      allCandidates: scoredCandidates.map((c) => {
        const rankIndex = analyzedOnly.findIndex((a) => a.applicationId === c.applicationId);
        return {
          ...c,
          rank: rankIndex >= 0 ? rankIndex + 1 : null,
        };
      }),
      comparison,
    };
  }

  private buildFallbackComparison(
    vacancyTitle: string,
    topCandidates: Array<{
      rank: number;
      candidateName: string;
      candidateId: number;
      matchScore: number;
      strengths: string[];
      gaps: string[];
    }>,
  ): TopComparisonResult {
    if (topCandidates.length === 0) {
      return {
        executiveSummary: `"${vacancyTitle}" vakansiyasi bo'yicha tahlil qilingan nomzodlar topilmadi. Avval nomzodlar rezyumesini AI orqali tahlil qiling.`,
        candidateHighlights: [],
        overallRecommendation: "Nomzodlarni tahlil qilish uchun 'AI Tahlil' tugmasini bosing.",
      };
    }

    const first = topCandidates[0];
    return {
      executiveSummary: `"${vacancyTitle}" vakansiyasi bo'yicha eng yaxshi natijani ${first.candidateName} (${first.matchScore}% moslik) ko'rsatdi. Nomzodlar vakansiya talablari asosida saralandi.`,
      candidateHighlights: topCandidates.map((c) => ({
        candidateId: c.candidateId,
        rank: c.rank,
        keyStrengthsSummary:
          c.strengths.length > 0
            ? `Asosiy kuchli tomonlari: ${c.strengths.slice(0, 3).join(', ')}.`
            : 'Umumiy talablarga moslik mavjud.',
        areasToVerify:
          c.gaps.length > 0
            ? `Suhbatda aniqlashtirilishi kerak: ${c.gaps.slice(0, 2).join(', ')}.`
            : "Bo'shliqlar aniqlanmadi.",
        recommendedInterviewFocus:
          "Texnik bilimlar va amaliy loyihalardagi tajribasi bo'yicha savollar berish.",
      })),
      overallRecommendation: `${topCandidates.map((c) => c.candidateName).join(', ')} bilan suhbat o'tkazish tavsiya etiladi.`,
    };
  }
}
