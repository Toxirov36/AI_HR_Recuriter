import { textAiProvider } from '../../config/app.config';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { Security, type Identity } from '../../common/utils/security';
import { AuditService } from '../audit/audit.service';
import { GeminiProvider } from '../ai/providers/gemini.provider';
import { assessmentInstructions } from '../ai/prompts/assessment.prompt';
import { vacancyAssessmentSchema, type AssessmentEdit } from '../ai/schemas/assessment.schema';
import { assessmentState, customQuestionsOf } from '../ai/utils/assessment-approval';

const SYSTEM_ACTOR = { userId: null, actorName: 'System', actorRole: 'SYSTEM' } as const;

/** AI drafts the candidate test for a vacancy; HR reviews, edits and approves it before the bot uses it. */
@Injectable()
export class VacancyAssessmentService {
  private readonly logger = new Logger(VacancyAssessmentService.name);

  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
    @Inject(GeminiProvider) private gemini: GeminiProvider,
    @Inject(AuditService) private audit: AuditService,
  ) {}

  private async load(companyId: number, id: number) {
    const vacancy = await this.db.vacancy.findFirst({ where: { id, companyId }, include: { requirements: true } });
    if (!vacancy) throw new NotFoundException('Vacancy not found');
    return vacancy;
  }

  async view(companyId: number, id: number) {
    const vacancy = await this.load(companyId, id);
    const state = assessmentState(vacancy);
    const parsed = state === 'PENDING' || state === 'APPROVED' ? vacancyAssessmentSchema.safeParse(vacancy.assessmentQuestions) : null;
    return {
      state,
      questions: parsed?.success ? parsed.data.questions : null,
      approvedAt: state === 'APPROVED' ? vacancy.assessmentApprovedAt : null,
      customQuestions: customQuestionsOf(vacancy.customQuestions),
    };
  }

  /** Creates a fresh draft for the current vacancy revision; it must be approved again. */
  async generate(actor: Identity, id: number) {
    await this.security.limit(`assessment-generate:${actor.companyId}:${id}`, 5, 3600);
    await this.createDraft(actor.companyId, id, { userId: actor.id, actorName: actor.fullName, actorRole: actor.role });
    return this.view(actor.companyId, id);
  }

  /** Called when a vacancy is saved while ACTIVE: drafts a test unless one already exists for this revision. */
  async autoGenerate(companyId: number, id: number) {
    try {
      if (!textAiProvider(this.security.config)) return;
      const vacancy = await this.load(companyId, id);
      if (vacancy.status !== 'ACTIVE') return;
      const state = assessmentState(vacancy);
      if (state === 'PENDING' || state === 'APPROVED') return;
      await this.security.limit(`assessment-auto:${companyId}`, 30, 3600);
      await this.createDraft(companyId, id, SYSTEM_ACTOR);
    } catch (error) {
      this.logger.warn(`Automatic test draft failed for vacancy ${id}: ${(error as Error).message}`);
    }
  }

  private async createDraft(companyId: number, id: number, actor: { userId: number | null; actorName: string; actorRole: string }) {
    const vacancy = await this.load(companyId, id);
    const assessment = await this.gemini.generate(
      vacancyAssessmentSchema,
      `Generate 10 screening assessment questions (5 Hard Skills + 5 Soft Skills) for the role "${vacancy.title}".`,
      {
        title: vacancy.title,
        description: vacancy.description,
        requirements: vacancy.requirements.map((r) => ({ name: r.name, description: r.description, required: r.required })),
      },
      assessmentInstructions,
    );
    const saved = await this.db.vacancy.updateMany({
      where: { id, companyId, revision: vacancy.revision },
      data: {
        assessmentQuestions: assessment as unknown as Prisma.InputJsonValue,
        assessmentRevision: vacancy.revision,
        assessmentApprovedAt: null,
        assessmentEditVersion: { increment: 1 },
      },
    });
    if (!saved.count) throw new ConflictException('The vacancy changed while the test was being generated. Try again.');
    await this.record(companyId, id, actor, 'VACANCY_ASSESSMENT_GENERATED');
  }

  /** HR edits the draft; any edit withdraws a previous approval. */
  async save(actor: Identity, id: number, edit: AssessmentEdit) {
    const vacancy = await this.load(actor.companyId, id);
    if (assessmentState(vacancy) === 'NONE' || assessmentState(vacancy) === 'STALE') {
      throw new ConflictException('Generate the test for the current vacancy first.');
    }
    const saved = await this.db.vacancy.updateMany({
      where: { id, companyId: actor.companyId, revision: vacancy.revision, assessmentEditVersion: vacancy.assessmentEditVersion },
      data: {
        assessmentQuestions: { questions: edit.questions } as unknown as Prisma.InputJsonValue,
        customQuestions: edit.customQuestions as unknown as Prisma.InputJsonValue,
        assessmentApprovedAt: null,
        assessmentEditVersion: { increment: 1 },
      },
    });
    if (!saved.count) throw new ConflictException('The test was changed by someone else. Reload and try again.');
    await this.record(actor.companyId, id, { userId: actor.id, actorName: actor.fullName, actorRole: actor.role }, 'VACANCY_ASSESSMENT_EDITED');
    return this.view(actor.companyId, id);
  }

  async approve(actor: Identity, id: number) {
    const vacancy = await this.load(actor.companyId, id);
    const state = assessmentState(vacancy);
    if (state === 'APPROVED') return this.view(actor.companyId, id);
    if (state !== 'PENDING') throw new ConflictException('There is no up-to-date test to approve. Generate it first.');
    const approved = await this.db.vacancy.updateMany({
      where: { id, companyId: actor.companyId, revision: vacancy.revision, assessmentRevision: vacancy.revision, assessmentEditVersion: vacancy.assessmentEditVersion, assessmentApprovedAt: null },
      data: { assessmentApprovedAt: new Date() },
    });
    if (!approved.count) throw new ConflictException('The test changed while you were reviewing it. Reload and review again.');
    await this.record(actor.companyId, id, { userId: actor.id, actorName: actor.fullName, actorRole: actor.role }, 'VACANCY_ASSESSMENT_APPROVED');
    return this.view(actor.companyId, id);
  }

  private record(companyId: number, id: number, actor: { userId: number | null; actorName: string; actorRole: string }, action: string) {
    return this.audit.log({ companyId, ...actor, action, resourceType: 'Vacancy', resourceId: String(id) });
  }
}
