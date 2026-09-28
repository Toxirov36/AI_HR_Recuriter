import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../../database/prisma.service';
import { email, phone } from '../../common/pipes/validation';
import { hashToken, Security } from '../../common/utils/security';
import { CandidatesService } from '../candidates/candidates.service';
import { ResumesService } from '../resumes/resumes.service';
import { NotificationService } from '../notifications/notification.service';

const contactEmail = z.union([email, z.literal('')]).optional().transform((value) => value || null);
const contactPhone = z.union([phone, z.literal('')]).optional().transform((value) => value || null);

export const publicApplicationSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: contactEmail,
  phone: contactPhone,
  privacyAccepted: z.literal('true'),
  aiConsent: z.enum(['true', 'false']).default('false'),
}).strict().refine((value) => Boolean(value.email || value.phone), {
  path: ['email'], message: 'Email or phone is required',
});

@Injectable()
export class PublicApplicationsService {
  private readonly logger = new Logger(PublicApplicationsService.name);

  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Security) private readonly security: Security,
    @Inject(ResumesService) private readonly resumes: ResumesService,
    @Inject(CandidatesService) private readonly candidates: CandidatesService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async vacancy(token: string) {
    const vacancy = await this.db.vacancy.findUnique({
      where: { publicToken: token, status: 'ACTIVE', company: { isActive: true } },
      select: {
        id: true, companyId: true, title: true, description: true,
        company: { select: { name: true, retentionDays: true } },
      },
    });
    if (!vacancy) throw new NotFoundException('This vacancy is not accepting applications');
    return vacancy;
  }

  async publicVacancy(token: string) {
    const { id: _id, companyId: _companyId, ...publicFields } = await this.vacancy(token);
    return publicFields;
  }

  async apply(token: string, input: z.infer<typeof publicApplicationSchema>, file: Express.Multer.File, ip?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Attach a PDF or DOCX CV');
    const vacancy = await this.vacancy(token);
    const identity = hashToken((input.email ?? input.phone!).toLowerCase()).slice(0, 32);
    await this.security.limit(`public-apply:${vacancy.id}:${ip ?? 'unknown'}`, 20, 3600);
    await this.security.limit(`public-apply-contact:${vacancy.id}:${identity}`, 3, 3600);

    const candidate = await this.db.candidate.create({
      data: {
        companyId: vacancy.companyId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        source: 'WEBSITE',
        publicSubmittedAt: new Date(),
        privacyAcceptedAt: new Date(),
        aiConsentAt: input.aiConsent === 'true' ? new Date() : null,
      },
      select: { id: true, fullName: true, companyId: true, email: true, phone: true },
    });

    let createdApp: { id: number } | null = null;
    try {
      await this.resumes.upload(vacancy.companyId, candidate.id, file);
      await this.db.$transaction(async (tx) => {
        const stillActive = await tx.vacancy.findUnique({
          where: { id: vacancy.id, company: { isActive: true } }, select: { status: true },
        });
        if (stillActive?.status !== 'ACTIVE') {
          throw new NotFoundException('This vacancy is not accepting applications');
        }
        createdApp = await tx.application.create({
          data: { companyId: vacancy.companyId, vacancyId: vacancy.id, candidateId: candidate.id, status: 'NEW' },
        });
        await tx.candidateEvent.create({
          data: { companyId: vacancy.companyId, candidateId: candidate.id, type: 'PUBLIC_APPLICATION_RECEIVED', label: `Applied for ${vacancy.title} through public form` },
        });
      });

      if (createdApp) {
        void this.notifications.notifyRecruitersNewApplication({
          applicationId: (createdApp as { id: number }).id,
          candidate,
          vacancy,
          companyId: vacancy.companyId,
          source: 'Veb-sayt (Public form)',
        });
      }
    } catch (error) {
      await this.candidates.deleteCandidate(vacancy.companyId, candidate.id).catch(() => {
        this.logger.warn(`Unable to clean up failed public application candidate ${candidate.id}`);
      });
      throw error;
    }
    return { ok: true };
  }
}
