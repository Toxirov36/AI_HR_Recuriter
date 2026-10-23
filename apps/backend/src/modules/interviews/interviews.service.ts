import { randomBytes } from 'node:crypto';
import { BadGatewayException, BadRequestException, ConflictException, GoneException, HttpException, Inject, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { hashToken, Security, type Identity } from '../../common/utils/security';
import { AuditService } from '../audit/audit.service';
import { GoogleCalendarNotConnectedError, GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { formatInterviewTime, NotificationService } from '../notifications/notification.service';
import { TelegramApiService } from '../telegram/telegram-api.service';
import { TelegramCallbackRegistry } from '../telegram/telegram-callback.registry';
import { botText, DEFAULT_BOT_LANG, isBotLang, type BotMessageKey } from '../telegram/telegram-i18n';
import type { TelegramCallbackQuery } from '../telegram/types/telegram.types';
import { parseMapLink } from './map-link';
import { buildSlots, MIN_LEAD_MS, type CreateInterviewInput, type RescheduleInterviewInput } from './interviews.schemas';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const ACTIVE = ['PROPOSED', 'CONFIRMED'] as const;

const applicationInclude = {
  candidate: { select: { id: true, fullName: true, email: true, phone: true, telegramUserId: true, companyId: true } },
  vacancy: { select: { id: true, title: true } },
  company: { select: { name: true } },
} as const;

@Injectable()
export class InterviewsService implements OnModuleInit {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
    @Inject(GoogleCalendarService) private google: GoogleCalendarService,
    @Inject(NotificationService) private notifications: NotificationService,
    @Inject(AuditService) private audit: AuditService,
    @Optional() @Inject(TelegramCallbackRegistry) private registry?: TelegramCallbackRegistry,
    @Optional() @Inject(TelegramApiService) private telegram?: TelegramApiService,
  ) {}

  onModuleInit() {
    this.registry?.register('iv:', (query) => this.handleTelegram(query));
  }

  // --- HR side ---

  async list(companyId: number, applicationId: number) {
    const interviews = await this.db.interview.findMany({
      where: { companyId, applicationId },
      orderBy: { createdAt: 'desc' },
      include: { slots: { orderBy: { startsAt: 'asc' } }, organizer: { select: { id: true, fullName: true } } },
    });
    return interviews.map(({ tokenHash: _tokenHash, ...interview }) => interview);
  }

  async create(user: Identity, applicationId: number, input: CreateInterviewInput, meta: { ip?: string; userAgent?: string } = {}) {
    const application = await this.db.application.findFirst({ where: { id: applicationId, companyId: user.companyId }, include: applicationInclude });
    if (!application) throw new NotFoundException('Application not found');
    if (application.status === 'REJECTED' || application.status === 'HIRED') throw new ConflictException('This application is already closed');
    const active = await this.db.interview.findFirst({ where: { applicationId, status: { in: [...ACTIVE] } }, select: { id: true } });
    if (active) throw new ConflictException('An interview is already scheduled. Reschedule or cancel it first');
    await this.requireCalendarFor(user, input.mode);
    const slots = this.slots(input.slots, input.durationMinutes);
    const map = this.mapFor(input.mode, input.mapUrl);

    const token = randomBytes(24).toString('base64url');
    const interview = await this.db.$transaction(async (tx) => {
      // Moving to the interview stage here replaces the generic "you are invited" message with the real proposal.
      if (application.status === 'NEW' || application.status === 'REVIEWING') {
        const moved = await tx.application.updateMany({ where: { id: applicationId, companyId: user.companyId, status: application.status }, data: { status: 'INTERVIEW' } });
        if (moved.count) {
          await tx.applicationStageChange.create({
            data: { applicationId, fromStatus: application.status, toStatus: 'INTERVIEW', actorId: user.id, actorName: user.fullName },
          });
        }
      }
      return tx.interview.create({
        data: {
          companyId: user.companyId,
          applicationId,
          organizerId: user.id,
          mode: input.mode,
          durationMinutes: input.durationMinutes,
          location: input.mode === 'OFFLINE' ? input.location : null,
          ...map,
          note: input.note || null,
          tokenHash: hashToken(token),
          slots: { create: slots },
        },
        include: { slots: { orderBy: { startsAt: 'asc' } } },
      });
    });

    await this.audit.log({
      companyId: user.companyId, userId: user.id, actorName: user.fullName, actorRole: user.role,
      action: 'INTERVIEW_PROPOSED', resourceType: 'Interview', resourceId: String(interview.id),
      details: { applicationId, mode: input.mode, slots: slots.length }, ipAddress: meta.ip, userAgent: meta.userAgent,
    });
    return this.proposed(interview, application, token);
  }

  async reschedule(user: Identity, id: number, input: RescheduleInterviewInput, meta: { ip?: string; userAgent?: string } = {}) {
    const current = await this.db.interview.findFirst({ where: { id, companyId: user.companyId }, include: { application: { include: applicationInclude } } });
    if (!current) throw new NotFoundException('Interview not found');
    if (current.status === 'CANCELLED') throw new ConflictException('The interview was cancelled');
    const mode = input.mode ?? current.mode;
    const location = mode === 'OFFLINE' ? input.location ?? current.location : null;
    if (mode === 'OFFLINE' && !location) throw new BadRequestException('Address is required for an offline interview');
    await this.requireCalendarFor(user, mode);
    const slots = this.slots(input.slots, input.durationMinutes);
    const map = this.mapFor(mode, input.mapUrl, current);

    // A confirmed time is being replaced, so its calendar event must go.
    if (current.googleEventId) await this.google.deleteEvent(current.organizerId, current.googleEventId);

    const token = randomBytes(24).toString('base64url');
    const interview = await this.db.$transaction(async (tx) => {
      await tx.interviewSlot.deleteMany({ where: { interviewId: id } });
      return tx.interview.update({
        where: { id },
        data: {
          organizerId: user.id,
          mode,
          status: 'PROPOSED',
          durationMinutes: input.durationMinutes,
          location,
          ...map,
          note: input.note || null,
          tokenHash: hashToken(token),
          confirmedSlotId: null, confirmedAt: null, meetUrl: null, googleEventId: null, declinedAt: null, declineNote: null,
          slots: { create: slots },
        },
        include: { slots: { orderBy: { startsAt: 'asc' } } },
      });
    });
    await this.audit.log({
      companyId: user.companyId, userId: user.id, actorName: user.fullName, actorRole: user.role,
      action: 'INTERVIEW_RESCHEDULED', resourceType: 'Interview', resourceId: String(id),
      details: { applicationId: current.applicationId, mode, slots: slots.length }, ipAddress: meta.ip, userAgent: meta.userAgent,
    });
    return this.proposed(interview, current.application, token);
  }

  async cancel(user: Identity, id: number, meta: { ip?: string; userAgent?: string } = {}) {
    const current = await this.db.interview.findFirst({ where: { id, companyId: user.companyId }, include: { application: { include: applicationInclude } } });
    if (!current) throw new NotFoundException('Interview not found');
    const claimed = await this.db.interview.updateMany({ where: { id, status: { in: [...ACTIVE] } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    if (!claimed.count) throw new ConflictException('The interview is already cancelled');
    if (current.googleEventId) await this.google.deleteEvent(current.organizerId, current.googleEventId);
    await this.audit.log({
      companyId: user.companyId, userId: user.id, actorName: user.fullName, actorRole: user.role,
      action: 'INTERVIEW_CANCELLED', resourceType: 'Interview', resourceId: String(id),
      details: { applicationId: current.applicationId }, ipAddress: meta.ip, userAgent: meta.userAgent,
    });
    const { candidate, vacancy, company } = current.application;
    await this.notifications.sendInterviewCancelled({ candidate, vacancy, companyName: company.name }).catch(() => undefined);
    return { ok: true };
  }

  // --- candidate side (token page) ---

  async publicView(token: string, ip?: string) {
    await this.security.limit(`interview-view:${ip ?? 'unknown'}`, 60, 60);
    return this.viewOf(await this.byToken(token));
  }

  async confirm(token: string, slotId: number, ip?: string) {
    await this.security.limit(`interview-confirm:${ip ?? 'unknown'}`, 10, 600);
    return this.confirmSlot(await this.byToken(token), slotId);
  }

  /** Confirms one proposed time, whether the candidate picked it on the token page or with a bot button. */
  private async confirmSlot(interview: LoadedInterview, slotId: number) {
    if (interview.status === 'CANCELLED') throw new GoneException('This interview was cancelled');
    if (interview.status === 'CONFIRMED') throw new ConflictException('A time is already confirmed');
    const slot = interview.slots.find((candidate) => candidate.id === slotId);
    if (!slot) throw new NotFoundException('Time slot not found');
    if (slot.startsAt.getTime() < Date.now() + MIN_LEAD_MS) throw new ConflictException('This time is no longer available');

    // The status update is the atomic claim: only one answer can win.
    const claimed = await this.db.interview.updateMany({
      where: { id: interview.id, status: 'PROPOSED' },
      data: { status: 'CONFIRMED', confirmedSlotId: slot.id, confirmedAt: new Date(), declinedAt: null, declineNote: null },
    });
    if (!claimed.count) throw new ConflictException('A time is already confirmed');

    const { candidate, vacancy, company } = interview.application;
    let event: { eventId: string; meetUrl: string | null } | null = null;
    try {
      event = await this.google.createEvent(interview.organizerId, {
        summary: `${vacancy.title} — ${candidate.fullName}`,
        description: `${company.name}\n${this.security.config.FRONTEND_ORIGIN}/applications/${interview.applicationId}`,
        location: interview.mode === 'OFFLINE' ? interview.location ?? undefined : undefined,
        start: slot.startsAt,
        end: slot.endsAt,
        timezone: interview.timezone,
        attendeeEmail: candidate.email,
        withMeet: interview.mode === 'ONLINE',
        requestId: `iv-${interview.id}-${slot.id}`,
      });
    } catch (error) {
      if (interview.mode === 'ONLINE') {
        // No Meet link means no usable interview: release the claim so the candidate can try again.
        await this.db.interview.updateMany({ where: { id: interview.id, status: 'CONFIRMED', confirmedSlotId: slot.id }, data: { status: 'PROPOSED', confirmedSlotId: null, confirmedAt: null } });
        this.logger.warn(`Interview ${interview.id} could not get a Meet link: ${(error as Error).message}`);
        if (error instanceof GoogleCalendarNotConnectedError) throw new BadGatewayException('The recruiter’s calendar is not connected. HR has been notified');
        throw new BadGatewayException('The meeting could not be created. Please try again in a moment');
      }
      // Offline interviews do not depend on the calendar entry.
      this.logger.warn(`Interview ${interview.id}: calendar entry skipped (${(error as Error).message})`);
    }

    const confirmed = await this.db.interview.update({
      where: { id: interview.id },
      data: { meetUrl: event?.meetUrl ?? null, googleEventId: event?.eventId ?? null },
      include: { slots: { orderBy: { startsAt: 'asc' } }, application: { include: applicationInclude } },
    });
    await this.notifications
      .sendInterviewConfirmation({
        candidate, vacancy, companyName: company.name,
        interview: { mode: interview.mode, durationMinutes: interview.durationMinutes, timezone: interview.timezone, startsAt: slot.startsAt, meetUrl: event?.meetUrl, location: interview.location, mapUrl: interview.mapUrl, mapLat: interview.mapLat, mapLng: interview.mapLng },
      })
      .catch(() => undefined);
    await this.notifications
      .notifyOrganizer({
        companyId: interview.companyId, organizerId: interview.organizerId, applicationId: interview.applicationId,
        text:
          `✅ ${candidate.fullName} suhbat vaqtini tasdiqladi: ${formatInterviewTime(slot.startsAt, interview.timezone)} (${vacancy.title}).` +
          (interview.mode === 'ONLINE' && event?.meetUrl ? `\n🔗 Google Meet: ${event.meetUrl}` : '') +
          (interview.mode === 'OFFLINE' && interview.location ? `\n📍 ${interview.location}` : ''),
      })
      .catch(() => undefined);
    return this.viewOf(confirmed);
  }

  async decline(token: string, note: string | undefined, ip?: string) {
    await this.security.limit(`interview-decline:${ip ?? 'unknown'}`, 10, 600);
    return this.declineInterview(await this.byToken(token), note);
  }

  private async declineInterview(interview: LoadedInterview, note: string | undefined) {
    if (interview.status === 'CANCELLED') throw new GoneException('This interview was cancelled');
    if (interview.status === 'CONFIRMED') throw new ConflictException('A time is already confirmed');
    await this.db.interview.updateMany({ where: { id: interview.id, status: 'PROPOSED' }, data: { declinedAt: new Date(), declineNote: note || null } });
    const { candidate, vacancy } = interview.application;
    await this.notifications
      .notifyOrganizer({
        companyId: interview.companyId, organizerId: interview.organizerId, applicationId: interview.applicationId,
        text: `⚠️ ${candidate.fullName} taklif qilingan vaqtlarga mos kelmadi (${vacancy.title}).${note ? `\nIzoh: ${note}` : ''}\nYangi vaqtlarni taklif qiling.`,
      })
      .catch(() => undefined);
    return this.viewOf({ ...interview, declinedAt: new Date() });
  }

  // --- the candidate's one-tap answer in the bot ---

  private async langOf(userId: string) {
    const row = await this.db.telegramUserLanguage.findUnique({ where: { telegramUserId: userId }, select: { language: true } }).catch(() => null);
    return isBotLang(row?.language) ? row.language : DEFAULT_BOT_LANG;
  }

  /** "iv:<interviewId>:<slotId>" confirms that slot; slot 0 is "none of these times work". */
  async handleTelegram(query: TelegramCallbackQuery) {
    if (!this.telegram) return;
    const match = /^iv:(\d+):(\d+)$/.exec(query.data ?? '');
    if (!match) return;
    const userId = String(query.from.id);
    const lang = await this.langOf(userId);
    const t = (key: BotMessageKey, params?: Record<string, string | number>) => botText(lang, key, params);
    const answer = (text?: string, alert = false) => this.telegram!.answerCallbackQuery(query.id, text, alert);
    try {
      await this.security.limit(`interview-tg:${userId}`, 20, 600);
    } catch {
      await answer(t('interviewTooMany'), true);
      return;
    }
    const interview = await this.db.interview.findUnique({
      where: { id: Number(match[1]) },
      include: { slots: { orderBy: { startsAt: 'asc' } }, application: { include: applicationInclude } },
    });
    // Only the candidate this interview is for may answer it.
    if (!interview || interview.application.candidate.telegramUserId !== userId) {
      await answer(t('interviewButtonNotYours'), true);
      return;
    }
    const slotId = Number(match[2]);
    try {
      let text: string;
      if (slotId === 0) {
        await this.declineInterview(interview, undefined);
        text = t('interviewDeclinedThanks');
      } else {
        await this.confirmSlot(interview, slotId);
        const slot = interview.slots.find((candidate) => candidate.id === slotId)!;
        text = t('interviewPicked', { when: formatInterviewTime(slot.startsAt, interview.timezone) });
      }
      await answer(text);
      const chatId = query.message?.chat?.id;
      const messageId = query.message?.message_id;
      if (chatId && messageId) await this.telegram.editMessageText(chatId, messageId, text);
    } catch (error) {
      if (error instanceof BadGatewayException) await answer(t('interviewMeetFailed'), true);
      else if (error instanceof HttpException) await answer(t('interviewButtonStale'), true);
      else throw error;
    }
  }

  // --- helpers ---

  private slots(starts: string[], durationMinutes: number) {
    try {
      return buildSlots(starts, durationMinutes);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  /**
   * Map link for an offline interview: undefined keeps the current one (reschedule), an empty value clears it, anything
   * else must be an accepted https map link. Online interviews never carry one.
   */
  private mapFor(
    mode: 'ONLINE' | 'OFFLINE',
    mapUrl: string | undefined,
    keep?: { mapUrl: string | null; mapLat: number | null; mapLng: number | null },
  ) {
    const none = { mapUrl: null, mapLat: null, mapLng: null };
    if (mode !== 'OFFLINE') return none;
    if (mapUrl === undefined) return keep ? { mapUrl: keep.mapUrl, mapLat: keep.mapLat, mapLng: keep.mapLng } : none;
    if (!mapUrl.trim()) return none;
    const parsed = parseMapLink(mapUrl);
    if (!parsed) throw new BadRequestException('Use an https link from Google Maps, Yandex Maps, 2GIS or OpenStreetMap');
    return { mapUrl: parsed.url, mapLat: parsed.lat, mapLng: parsed.lng };
  }

  /** Online interviews need the recruiter's Google account; offline ones do not. */
  private async requireCalendarFor(user: Identity, mode: 'ONLINE' | 'OFFLINE') {
    if (mode === 'ONLINE' && !(await this.google.isConnected(user.id))) {
      throw new ConflictException('Connect your Google Calendar first (Profile → Google Calendar) to create Google Meet interviews');
    }
  }

  private async proposed(
    interview: { id: number; mode: 'ONLINE' | 'OFFLINE'; durationMinutes: number; note: string | null; tokenHash: string; timezone?: string; slots?: Array<{ id: number; startsAt: Date }> },
    application: { candidate: { id: number; fullName: string; email: string | null; phone: string | null; telegramUserId: string | null; companyId: number }; vacancy: { id: number; title: string }; company: { name: string } },
    token: string,
  ) {
    const { tokenHash: _tokenHash, ...safe } = interview;
    const delivery = await this.notifications
      .sendInterviewProposal({ candidate: application.candidate, vacancy: application.vacancy, companyName: application.company.name, interview, token })
      .catch(() => ({ telegramSent: false, emailSent: false }));
    // The link is shown to HR once so they can send it themselves if neither channel worked.
    return { interview: safe, delivery, shareUrl: `${this.security.config.FRONTEND_ORIGIN}/interview/${token}` };
  }

  /** Only names the type of an interview loaded with its slots and application. */
  private loadForType(id: number) {
    return this.db.interview.findUnique({ where: { id }, include: { slots: { orderBy: { startsAt: 'asc' } }, application: { include: applicationInclude } } });
  }

  private async byToken(token: string) {
    if (!TOKEN_PATTERN.test(token)) throw new NotFoundException('Interview not found');
    const interview = await this.db.interview.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { slots: { orderBy: { startsAt: 'asc' } }, application: { include: applicationInclude } },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    return interview;
  }

  /** What the candidate page shows: no contact details of anyone, only the meeting itself. */
  private viewOf(interview: {
    status: 'PROPOSED' | 'CONFIRMED' | 'CANCELLED';
    mode: 'ONLINE' | 'OFFLINE';
    durationMinutes: number;
    timezone: string;
    location: string | null;
    mapUrl?: string | null;
    note: string | null;
    meetUrl: string | null;
    declinedAt: Date | null;
    confirmedSlotId: number | null;
    slots: Array<{ id: number; startsAt: Date }>;
    application: { vacancy: { title: string }; company: { name: string } };
  }) {
    const now = Date.now();
    const confirmedSlot = interview.slots.find((slot) => slot.id === interview.confirmedSlotId);
    return {
      status: interview.status,
      mode: interview.mode,
      companyName: interview.application.company.name,
      vacancyTitle: interview.application.vacancy.title,
      durationMinutes: interview.durationMinutes,
      timezone: interview.timezone,
      location: interview.location,
      mapUrl: interview.mapUrl ?? null,
      note: interview.note,
      declined: Boolean(interview.declinedAt),
      slots: interview.status === 'PROPOSED' ? interview.slots.filter((slot) => slot.startsAt.getTime() >= now + MIN_LEAD_MS).map((slot) => ({ id: slot.id, startsAt: slot.startsAt })) : [],
      confirmed: interview.status === 'CONFIRMED' && confirmedSlot ? { startsAt: confirmedSlot.startsAt, meetUrl: interview.meetUrl, location: interview.location, mapUrl: interview.mapUrl ?? null } : null,
    };
  }
}

type LoadedInterview = NonNullable<Awaited<ReturnType<InterviewsService['loadForType']>>>;
