import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { Database } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { Security, hashToken, type Identity } from '../../common/utils/security';
import { AuditService } from '../audit/audit.service';
import { ExternalRecruitingService } from '../external-recruiting/external-recruiting.service';
import { HeadHunterService } from '../external-recruiting/headhunter.service';
import { GeminiProvider } from '../ai/providers/gemini.provider';
import { assessmentInstructions } from '../ai/prompts/assessment.prompt';
import { vacancyAssessmentSchema, type VacancyAssessment } from '../ai/schemas/assessment.schema';
import { TelegramApiService } from './telegram-api.service';
import { TelegramScreeningAlertService } from './telegram-screening-alert.service';
import type { TelegramCallbackQuery, TelegramDirectMessage } from './types/telegram.types';

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const button = (text: string, data: string) => ({ text, callback_data: data });
type Admin = { id: number; companyId: number; fullName: string; telegramId: string };
type Draft = {
  kind: 'channel' | 'question' | 'publication';
  publicationId?: number;
  vacancyId?: number;
  vacancyRevision?: number;
  expectedVersion?: number;
  assessment?: VacancyAssessment;
  questionIndex?: number;
  field?: 'question' | 'explanation' | 'option0' | 'option1' | 'option2' | 'option3';
};

@Injectable()
export class TelegramAdminService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
    @Inject(TelegramApiService) private telegram: TelegramApiService,
    @Inject(ExternalRecruitingService) private recruiting: ExternalRecruitingService,
    @Inject(HeadHunterService) private hh: HeadHunterService,
    @Inject(GeminiProvider) private gemini: GeminiProvider,
    @Inject(TelegramScreeningAlertService) private alerts: TelegramScreeningAlertService,
    @Inject(AuditService) private audit: AuditService,
  ) {}

  private identity(admin: Admin): Identity {
    return { id: admin.id, companyId: admin.companyId, fullName: admin.fullName, role: 'ADMIN', email: null };
  }

  private async actor(telegramId: string): Promise<Admin | null> {
    const link = await this.db.telegramAdminLink.findUnique({ where: { telegramUserId: telegramId } });
    if (!link) return null;
    const user = await this.db.user.findUnique({
      where: { id: link.userId },
      select: { id: true, companyId: true, fullName: true, role: true, isActive: true, company: { select: { isActive: true } } },
    });
    if (!user || user.role !== 'ADMIN' || !user.isActive || !user.company.isActive || user.companyId !== link.companyId) return null;
    return { id: user.id, companyId: user.companyId, fullName: user.fullName, telegramId };
  }

  async status(user: Identity) {
    if (user.role !== 'ADMIN') return { connected: false };
    const link = await this.db.telegramAdminLink.findUnique({ where: { userId: user.id } });
    return { connected: !!link && link.companyId === user.companyId, telegramUsername: link?.telegramUsername ?? null };
  }

  async createPairing(user: Identity) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Faqat kompaniya administratori ulana oladi.');
    await this.security.limit(`telegram-admin-pair:${user.id}`, 5, 3600);
    await this.db.telegramAdminPairing.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.db.telegramAdminPairing.deleteMany({ where: { companyId: user.companyId, userId: user.id, usedAt: null } });
    const token = `admin_${randomBytes(24).toString('hex')}`;
    await this.db.telegramAdminPairing.create({
      data: { companyId: user.companyId, userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 15 * 60_000) },
    });
    const bot = await this.telegram.getMe();
    return { url: `https://t.me/${bot.username}?start=${token}`, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  }

  async disconnect(user: Identity) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Faqat kompaniya administratori uzishi mumkin.');
    await this.db.telegramAdminLink.deleteMany({ where: { userId: user.id, companyId: user.companyId } });
    await this.db.telegramAdminPairing.deleteMany({ where: { userId: user.id, companyId: user.companyId, usedAt: null } });
    await this.log({ id: user.id, companyId: user.companyId, fullName: user.fullName, telegramId: '' }, 'TELEGRAM_ADMIN_UNLINKED', 'USER', user.id);
    return { ok: true };
  }

  async pair(message: TelegramDirectMessage, token: string) {
    if (message.chat.type !== 'private' || !message.from || message.chat.id !== message.from.id) return;
    const telegramId = String(message.from.id);
    try {
      const result = await this.db.$transaction(async (tx) => {
        const pairing = await tx.telegramAdminPairing.findUnique({ where: { tokenHash: hashToken(token) } });
        if (!pairing || pairing.usedAt || pairing.expiresAt <= new Date()) return null;
        const user = await tx.user.findUnique({ where: { id: pairing.userId }, include: { company: true } });
        if (!user || user.companyId !== pairing.companyId || user.role !== 'ADMIN' || !user.isActive || !user.company.isActive) return null;
        const claimed = await tx.telegramAdminPairing.updateMany({ where: { id: pairing.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
        if (!claimed.count) return null;
        await tx.telegramAdminLink.upsert({
          where: { userId: user.id },
          create: { userId: user.id, companyId: user.companyId, telegramUserId: telegramId, telegramUsername: message.from?.username ?? null },
          update: { companyId: user.companyId, telegramUserId: telegramId, telegramUsername: message.from?.username ?? null },
        });
        return { id: user.id, companyId: user.companyId, fullName: user.fullName, telegramId };
      });
      if (!result) return this.send(telegramId, 'Ulanish havolasi eskirgan yoki ishlatilgan. Saytdan yangisini oling.');
      await this.log(result, 'TELEGRAM_ADMIN_LINKED', 'USER', result.id);
      return this.menu(result);
    } catch {
      return this.send(telegramId, 'Bu Telegram hisobi boshqa administratorga ulangan. Avval o‘sha ulanishni uzing.');
    }
  }

  private stateKey(id: string) { return `telegram-admin-draft:${id}`; }
  private async draft(id: string): Promise<Draft | null> {
    const raw = await this.security.redis.get(this.stateKey(id));
    if (!raw) return null;
    try { return JSON.parse(raw) as Draft; } catch { return null; }
  }
  private async setDraft(id: string, value: Draft) { await this.security.redis.set(this.stateKey(id), JSON.stringify(value), 'EX', 900); }
  private async clearDraft(id: string) { await this.security.redis.del(this.stateKey(id)); }

  private async send(chatId: string | number, text: string, rows?: ReturnType<typeof button>[][]) {
    const long = text.length > 3900;
    const body = long
      ? text.replace(/<\/?b>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').slice(0, 3900)
      : text;
    return this.telegram.sendMessage(chatId, body, { ...(long ? {} : { parseMode: 'HTML' }), ...(rows ? { replyMarkup: { inline_keyboard: rows } } : {}) });
  }
  private async log(admin: Admin, action: string, resourceType: string, resourceId: string | number, details?: Record<string, unknown>) {
    await this.audit.log({ companyId: admin.companyId, userId: admin.id, actorName: admin.fullName, actorRole: 'ADMIN', action, resourceType, resourceId: String(resourceId), details });
  }

  async handleText(message: TelegramDirectMessage): Promise<boolean> {
    if (message.chat.type !== 'private' || !message.from || message.chat.id !== message.from.id || !message.text) return false;
    const text = message.text.trim();
    const telegramId = String(message.from.id);
    if (/^\/start\s+admin_[0-9a-f]{48}$/i.test(text)) {
      await this.pair(message, text.split(/\s+/)[1]);
      return true;
    }
    if (/^\/admin(?:@\w+)?$/i.test(text)) {
      const admin = await this.actor(telegramId);
      if (admin) await this.menu(admin);
      else await this.send(telegramId, 'Admin panel uchun saytdagi «Telegram» sozlamasidan bir martalik ulanish havolasini oching.');
      return true;
    }
    if (/^\/cancel(?:@\w+)?$/i.test(text)) {
      const admin = await this.actor(telegramId);
      if (!admin) return false;
      await this.clearDraft(telegramId);
      await this.menu(admin);
      return true;
    }
    const state = await this.draft(telegramId);
    if (!state || text.startsWith('/')) return false;
    const admin = await this.actor(telegramId);
    if (!admin) { await this.clearDraft(telegramId); return false; }
    try {
      if (state.kind === 'channel') {
        if (!/^(@[a-zA-Z0-9_]{5,32}|-100\d{5,20})$/.test(text)) throw new Error('Kanal @nomi yoki -100 bilan boshlanuvchi IDni kiriting.');
        const channel = await this.recruiting.addChannel(this.identity(admin), text);
        await this.clearDraft(telegramId);
        await this.log(admin, 'TELEGRAM_ADMIN_CHANNEL_ADDED', 'TELEGRAM_CHANNEL', channel.id);
        await this.send(telegramId, `✅ ${escapeHtml(channel.title)} kanali ulandi.`);
        await this.channels(admin);
      } else if (state.kind === 'publication' && state.publicationId) {
        if (!/^\d{1,20}$/.test(text)) throw new Error('Platformadagi e’lonning raqamli ID sini kiriting.');
        await this.recruiting.confirmFound(this.identity(admin), state.publicationId, text);
        await this.clearDraft(telegramId);
        await this.log(admin, 'TELEGRAM_ADMIN_PUBLICATION_FOUND', 'VACANCY_PUBLICATION', state.publicationId);
        await this.send(telegramId, '✅ Tashqi e’lon tekshirildi va bog‘landi.');
      } else if (state.assessment && state.field && state.questionIndex !== undefined) {
        const minLength = state.field.startsWith('option') ? 1 : 5;
        if (text.length < minLength || text.length > 500) throw new Error(`Matn ${minLength}–500 belgidan iborat bo‘lsin.`);
        const question = state.assessment.questions[state.questionIndex];
        if (!question) throw new Error('Savol topilmadi.');
        if (state.field.startsWith('option')) question.options[Number(state.field.slice(-1))] = text;
        else if (state.field === 'question' || state.field === 'explanation') question[state.field] = text;
        state.field = undefined;
        await this.setDraft(telegramId, state);
        await this.questionEditor(admin, state);
      }
    } catch (error) {
      await this.send(telegramId, `⚠️ ${escapeHtml((error as Error).message)}`);
    }
    return true;
  }

  private async menu(admin: Admin) {
    await this.send(admin.telegramId, `🔐 <b>Admin panel</b> · ${escapeHtml(admin.fullName)}\nKerakli bo‘limni tanlang:`, [
      [button('📌 Vakansiyalar', 'adm:vs:0'), button('📣 Kanallar', 'adm:channels')],
      [button('🔔 HR chatlari', 'adm:notify'), button('📨 Xabar xatolari', 'adm:alerts')],
      [button('🔓 Ulanishni uzish', 'adm:unlink')],
    ]);
  }

  private async vacancies(admin: Admin, offset: number) {
    const items = await this.db.vacancy.findMany({ where: { companyId: admin.companyId }, orderBy: { createdAt: 'desc' }, skip: offset, take: 9, select: { id: true, title: true, status: true } });
    const rows = items.slice(0, 8).map(v => [button(`${v.status === 'ACTIVE' ? '🟢' : '⚪'} ${v.title.slice(0, 35)}`, `adm:v:${v.id}`)]);
    if (offset) rows.push([button('⬅️ Oldingi', `adm:vs:${Math.max(0, offset - 8)}`)]);
    if (items.length > 8) rows.push([button('➡️ Keyingi', `adm:vs:${offset + 8}`)]);
    rows.push([button('🏠 Menyu', 'adm:home')]);
    await this.send(admin.telegramId, '<b>Vakansiyalar</b> · mavjud e’lonni tanlang.', rows);
  }

  private async vacancy(admin: Admin, id: number) {
    const v = await this.db.vacancy.findFirst({ where: { id, companyId: admin.companyId }, select: { id: true, title: true, status: true, revision: true } });
    if (!v) throw new Error('Vakansiya topilmadi.');
    const [passed, low, manual] = await Promise.all([
      this.db.application.count({ where: { companyId: admin.companyId, vacancyId: id, assessmentScore: { gte: 70 } } }),
      this.db.application.count({ where: { companyId: admin.companyId, vacancyId: id, assessmentScore: { lt: 70 } } }),
      this.db.application.count({ where: { companyId: admin.companyId, vacancyId: id, assessmentScore: null } }),
    ]);
    await this.send(admin.telegramId, `<b>${escapeHtml(v.title)}</b> · ${v.status}\n✅ 70%+: ${passed} · 📉 past: ${low} · 👀 qo‘lda: ${manual}\nO‘tish bali: 70%`, [
      [button('📣 Nashr', `adm:p:${id}`), button('📝 Test', `adm:q:${id}`)],
      [button('👥 Arizalar', `adm:a:${id}:0`)],
      ...(v.status === 'ACTIVE' ? [[button('🔒 Vakansiyani yopish', `adm:vc:${id}:${v.revision}`)]] : []),
      [button('⬅️ Ro‘yxat', 'adm:vs:0')],
    ]);
  }

  private async channels(admin: Admin, offset = 0) {
    const channels = await this.recruiting.channels(admin.companyId);
    const rows = channels.slice(offset, offset + 8).map(c => [button(`❌ ${c.title.slice(0, 35)}`, `adm:cr:${c.id}`)]);
    if (offset) rows.push([button('⬅️ Oldingi', `adm:channels:${Math.max(0, offset - 8)}`)]);
    if (channels.length > offset + 8) rows.push([button('➡️ Keyingi', `adm:channels:${offset + 8}`)]);
    rows.push([button('➕ Kanal qo‘shish', 'adm:ca')], [button('🏠 Menyu', 'adm:home')]);
    await this.send(admin.telegramId, `<b>Telegram kanallari</b>\n${channels.length ? 'Uzish uchun kanalni tanlang.' : 'Hozircha kanal ulanmagan.'}`, rows);
  }

  private async publications(admin: Admin, id: number, offset = 0) {
    const preview = await this.recruiting.preview(admin.companyId, id);
    const rows = preview.telegram.slice(offset, offset + 8).map(item => [button(`📢 ${item.channel.title.slice(0, 35)}`, `adm:tp:${id}:${item.channel.id}`)]);
    if (offset) rows.push([button('⬅️ Kanallar', `adm:p:${id}:${Math.max(0, offset - 8)}`)]);
    if (preview.telegram.length > offset + 8) rows.push([button('➡️ Kanallar', `adm:p:${id}:${offset + 8}`)]);
    for (const publication of preview.publications.filter(p => p.status === 'UNKNOWN' && !p.externalId)) {
      rows.push([button(`❓ ${publication.platform} nashrini tekshirish`, `adm:pu:${publication.id}`)]);
    }
    rows.push([button('hh.uz holati', `adm:hh:${id}`)], [button('⬅️ Vakansiya', `adm:v:${id}`)]);
    const states = preview.publications.map(p => `${p.platform}: ${p.status}${p.error ? ` (${p.error})` : ''}`).join('\n');
    await this.send(admin.telegramId, `<b>Nashrlar</b> · ${escapeHtml(preview.vacancy.title)}\n${escapeHtml(states || 'Hali nashr qilinmagan.')}`, rows);
  }

  private async telegramPreview(admin: Admin, id: number, channelId: number) {
    const preview = await this.recruiting.preview(admin.companyId, id);
    const target = preview.telegram.find(item => item.channel.id === channelId);
    if (!target || !target.text || preview.vacancy.status !== 'ACTIVE') throw new Error('Kanal yoki faol vacancy topilmadi.');
    await this.send(admin.telegramId, `<b>Nashr matni</b> · ${escapeHtml(target.channel.title)}\n\n${escapeHtml(target.text.slice(0, 3300))}`, [
      [button('✅ Nashrni tasdiqlash', `adm:tc:${id}:${channelId}:${preview.vacancy.revision}`)],
      [button('⬅️ Nashrlar', `adm:p:${id}`)],
    ]);
  }

  private async hhMenu(admin: Admin, id: number, offset = 0) {
    const preview = await this.recruiting.preview(admin.companyId, id);
    const vacancy = await this.db.vacancy.findFirst({ where: { id, companyId: admin.companyId } });
    if (!vacancy) throw new Error('Vakansiya topilmadi.');
    if (!preview.headhunter.configured) return this.send(admin.telegramId, 'hh.uz API serverda sozlanmagan.');
    if (!preview.headhunter.connected) return this.send(admin.telegramId, 'hh.uz ish beruvchi hisobi ulanmagan. Saytdagi admin bo‘limidan ulang.');
    if (preview.headhunter.connectedByUserId !== admin.id) return this.send(admin.telegramId, 'hh.uz nashrini hisobni ulagan administrator tasdiqlay oladi.');
    if (!vacancy.hhAreaId || !vacancy.hhProfessionalRoleId || !vacancy.hhExperienceId || !vacancy.hhEmploymentId || !vacancy.hhScheduleId)
      return this.send(admin.telegramId, 'hh.uz uchun kerakli vacancy maydonlarini avval saytda to‘ldiring.');
    const existing = preview.publications.find(p => p.platform === 'HEADHUNTER');
    if (existing?.externalId && existing.status !== 'CLOSED') {
      return this.send(admin.telegramId, `hh.uz nashri: ${existing.status}\n${escapeHtml(existing.externalUrl ?? '')}\n\n<b>${escapeHtml(vacancy.title)}</b>\n${escapeHtml(vacancy.description.slice(0, 3000))}`, [[button('📝 Tahrirni tasdiqlash', `adm:hc:${id}:${preview.vacancy.revision}:edit`)]]);
    }
    const result = await this.hh.packages(admin.companyId, vacancy.hhAreaId, vacancy.hhProfessionalRoleId) as { publication_variants?: Array<{ suitable_packages?: Array<{ employer_service_id: string; count?: number; invalid?: boolean }> }> };
    const packages = result.publication_variants?.flatMap(v => v.suitable_packages ?? []).filter(p => !p.invalid && (p.count ?? 0) > 0) ?? [];
    if (!packages.length) return this.send(admin.telegramId, 'hh.uz hisobida mavjud nashr paketi yo‘q.');
    const rows = packages.slice(offset, offset + 8).map((p, index) => [button(`${p.employer_service_id.slice(0, 30)} · ${p.count}`, `adm:hp:${id}:${preview.vacancy.revision}:${offset + index}`)]);
    if (offset) rows.push([button('⬅️ Paketlar', `adm:hh:${id}:${Math.max(0, offset - 8)}`)]);
    if (packages.length > offset + 8) rows.push([button('➡️ Paketlar', `adm:hh:${id}:${offset + 8}`)]);
    await this.send(admin.telegramId, '<b>hh.uz paketini tanlang</b> · tasdiqdan oldin yana tekshiriladi.', rows);
  }

  private async assessment(admin: Admin, id: number) {
    const v = await this.db.vacancy.findFirst({ where: { id, companyId: admin.companyId }, select: { title: true, revision: true, assessmentRevision: true, assessmentQuestions: true } });
    if (!v) throw new Error('Vakansiya topilmadi.');
    const parsed = v.assessmentRevision === v.revision ? vacancyAssessmentSchema.safeParse(v.assessmentQuestions) : null;
    const rows = parsed?.success ? parsed.data.questions.map((q, i) => [button(`${i < 5 ? '💡' : '🤝'} ${i + 1}. ${q.question.slice(0, 29)}`, `adm:qe:${id}:${i}`)]) : [];
    rows.push([button('🤖 AI orqali qayta yaratish', `adm:qr:${id}`)], [button('⬅️ Vakansiya', `adm:v:${id}`)]);
    await this.send(admin.telegramId, `<b>Test</b> · ${escapeHtml(v.title)}\n5 hard + 5 soft · o‘tish bali 7/10\n${parsed?.success ? 'Savolni tahrirlash uchun tanlang.' : 'Joriy versiyada savollar hali yaratilmagan.'}`, rows);
  }

  private async questionEditor(admin: Admin, state: Draft) {
    const q = state.assessment?.questions[state.questionIndex ?? -1];
    if (!q || state.vacancyId === undefined) throw new Error('Tahrir sessiyasi tugagan.');
    const i = state.questionIndex!;
    const options = q.options.map((value, idx) => `${idx === q.correctIndex ? '✅' : '▫️'} ${'ABCD'[idx]}) ${escapeHtml(value)}`).join('\n');
    await this.send(admin.telegramId, `<b>${i + 1}/10 · ${q.type}</b>\n${escapeHtml(q.question)}\n\n${options}\n\nIzoh: ${escapeHtml(q.explanation)}\n\nSaqlash yangi nomzodlarga ta’sir qiladi.`, [
      [button('Savol', 'adm:qf:question'), button('Izoh', 'adm:qf:explanation')],
      [0, 1, 2, 3].map(n => button(`${'ABCD'[n]} matni`, `adm:qf:option${n}`)),
      [0, 1, 2, 3].map(n => button(`${'ABCD'[n]} to‘g‘ri`, `adm:qo:${n}`)),
      [button('⬅️ Savol', `adm:qn:${Math.max(0, i - 1)}`), button('➡️ Savol', `adm:qn:${Math.min(9, i + 1)}`)],
      [button('👁 Barchasini ko‘rish', 'adm:qpreview'), button('✅ Saqlash', `adm:qsave:${state.vacancyId}`)],
      [button('❌ Bekor qilish', 'adm:cancel')],
    ]);
  }

  private async applications(admin: Admin, vacancyId: number, offset: number) {
    const vacancy = await this.db.vacancy.findFirst({ where: { id: vacancyId, companyId: admin.companyId }, select: { title: true } });
    if (!vacancy) throw new Error('Vakansiya topilmadi.');
    const apps = await this.db.application.findMany({ where: { companyId: admin.companyId, vacancyId }, include: { candidate: true }, orderBy: { createdAt: 'desc' }, skip: offset, take: 7 });
    const rows = apps.slice(0, 6).map(a => [button(`${a.assessmentScore === null ? '👀' : a.assessmentScore >= 70 ? '✅' : '📉'} ${a.candidate.fullName.slice(0, 30)} · ${a.assessmentScore ?? '—'}%`, `adm:ad:${a.id}`)]);
    if (offset) rows.push([button('⬅️ Oldingi', `adm:a:${vacancyId}:${Math.max(0, offset - 6)}`)]);
    if (apps.length > 6) rows.push([button('➡️ Keyingi', `adm:a:${vacancyId}:${offset + 6}`)]);
    rows.push([button('⬅️ Vakansiya', `adm:v:${vacancyId}`)]);
    await this.send(admin.telegramId, `<b>Arizalar</b> · ${escapeHtml(vacancy.title)}`, rows);
  }

  private async application(admin: Admin, id: number) {
    const app = await this.db.application.findFirst({ where: { id, companyId: admin.companyId }, include: { candidate: true, vacancy: true } });
    if (!app) throw new Error('Ariza topilmadi.');
    const result = app.assessmentResult as { score?: number; hardSkillScore?: number; softSkillScore?: number } | null;
    const url = `${this.security.config.FRONTEND_ORIGIN}/applications/${app.id}`;
    await this.send(admin.telegramId, `<b>${escapeHtml(app.candidate.fullName)}</b>\n💼 ${escapeHtml(app.vacancy.title)}\n📞 ${escapeHtml(app.candidate.phone ?? 'Kiritilmagan')}\n📊 Umumiy: ${result?.score ?? 'Qo‘lda'} · Hard: ${result?.hardSkillScore ?? '—'} · Soft: ${result?.softSkillScore ?? '—'}\nCV saytdagi arizada ochiladi.`, [[{ text: '📄 Arizani ochish', url } as any], [button('⬅️ Arizalar', `adm:a:${app.vacancyId}:0`)]]);
  }

  private connectionKey(id: string) { return createHash('sha256').update(id).digest('hex').slice(0, 14); }
  private async notifications(admin: Admin, offset = 0) {
    const connections = await this.db.telegramBusinessConnection.findMany({ where: { companyId: admin.companyId, enabled: true, user: { companyId: admin.companyId, isActive: true, role: { in: ['ADMIN', 'HR', 'RECRUITER'] } } }, orderBy: { updatedAt: 'desc' }, skip: offset, take: 9, include: { user: true } });
    const rows = connections.slice(0, 8).map(c => [button(`${c.screeningAlertsEnabled ? '🔔' : '🔕'} ${(c.user?.fullName ?? c.telegramUsername ?? String(c.telegramUserId)).slice(0, 30)}`, `adm:nt:${this.connectionKey(c.id)}:${c.screeningAlertsEnabled ? 1 : 0}`)]);
    if (offset) rows.push([button('⬅️ Oldingi', `adm:notify:${Math.max(0, offset - 8)}`)]);
    if (connections.length > 8) rows.push([button('➡️ Keyingi', `adm:notify:${offset + 8}`)]);
    rows.push([button('🏠 Menyu', 'adm:home')]);
    await this.send(admin.telegramId, `<b>HR xabarlari</b>\n${connections.length ? 'Yoqish/o‘chirish uchun chatni tanlang.' : 'Ulangan HR chatlari yo‘q. Saytdagi Telegram ulanishidan foydalaning.'}`, rows);
  }

  private async alertList(admin: Admin, offset = 0) {
    const alerts = await this.db.telegramScreeningAlert.findMany({ where: { companyId: admin.companyId, status: { in: ['FAILED', 'UNKNOWN'] } }, orderBy: { id: 'desc' }, skip: offset, take: 9, include: { application: { include: { candidate: true } } } });
    const rows = alerts.slice(0, 8).map(a => [button(`${a.status === 'UNKNOWN' ? '❓' : '⚠️'} ${a.application.candidate.fullName.slice(0, 25)}`, `adm:alert:${a.id}`)]);
    if (offset) rows.push([button('⬅️ Oldingi', `adm:alerts:${Math.max(0, offset - 8)}`)]);
    if (alerts.length > 8) rows.push([button('➡️ Keyingi', `adm:alerts:${offset + 8}`)]);
    rows.push([button('🏠 Menyu', 'adm:home')]);
    await this.send(admin.telegramId, `<b>HR xabarlaridagi xatolar</b>\n${alerts.length ? 'Xabarni tanlang.' : 'Tekshirish talab qiladigan xabar yo‘q.'}`, rows);
  }

  private async alertDetail(admin: Admin, id: number) {
    const a = await this.db.telegramScreeningAlert.findFirst({ where: { id, companyId: admin.companyId }, include: { application: { include: { candidate: true, vacancy: true } } } });
    if (!a) throw new Error('Xabar topilmadi.');
    const rows = a.status === 'UNKNOWN'
      ? [[button('✅ Yetkazilgan', `adm:as:${id}`)], [button('❌ Yetkazilmagan', `adm:am:${id}`)]]
      : a.status === 'FAILED' ? [[button('🔄 Qayta urinish', `adm:ar:${id}`)]] : [];
    rows.push([button('⬅️ Xatolar', 'adm:alerts')]);
    await this.send(admin.telegramId, `<b>${escapeHtml(a.application.candidate.fullName)}</b> · ${escapeHtml(a.application.vacancy.title)}\nChat: ${escapeHtml(a.chatId)}\nHolat: ${a.status}\nXato: ${escapeHtml(a.lastError ?? '—')}\nNoma’lum holatda Telegram chatini tekshirib keyin belgilang.`, rows);
  }

  async handleCallback(query: TelegramCallbackQuery): Promise<boolean> {
    const data = query.data ?? '';
    if (!data.startsWith('adm:')) return false;
    if (!query.message || query.message.chat.id !== query.from.id) { await this.telegram.answerCallbackQuery(query.id, 'Faqat shaxsiy chatda ishlaydi.', true); return true; }
    const admin = await this.actor(String(query.from.id));
    if (!admin) { await this.telegram.answerCallbackQuery(query.id, 'Admin ruxsati yo‘q yoki bekor qilingan.', true); return true; }
    await this.telegram.answerCallbackQuery(query.id);
    const p = data.split(':');
    const id = Number(p[2]);
    try {
      if (data === 'adm:home') await this.menu(admin);
      else if (p[1] === 'vs') await this.vacancies(admin, Math.max(0, Math.min(10000, id || 0)));
      else if (p[1] === 'v') await this.vacancy(admin, id);
      else if (p[1] === 'channels') await this.channels(admin, Math.max(0, Math.min(10000, id || 0)));
      else if (data === 'adm:ca') { await this.setDraft(admin.telegramId, { kind: 'channel' }); await this.send(admin.telegramId, 'Kanal @nomi yoki -100... IDni yuboring. Bot kanal administratori va nashr qilish huquqiga ega bo‘lsin. Bekor qilish: /cancel'); }
      else if (p[1] === 'cr') await this.send(admin.telegramId, 'Kanalni uzishni tasdiqlaysizmi? Faol nashri bo‘lsa uzilmaydi.', [[button('✅ Uzish', `adm:crc:${id}`)], [button('❌ Bekor', 'adm:channels')]]);
      else if (p[1] === 'crc') { await this.recruiting.removeChannel(this.identity(admin), id); await this.log(admin, 'TELEGRAM_ADMIN_CHANNEL_REMOVED', 'TELEGRAM_CHANNEL', id); await this.channels(admin); }
      else if (p[1] === 'p') await this.publications(admin, id, Math.max(0, Math.min(10000, Number(p[3]) || 0)));
      else if (p[1] === 'pu') await this.send(admin.telegramId, 'Platformadagi e’lonni tekshiring. Agar e’lon mavjud bo‘lsa uning ID sini kiriting; mavjud bo‘lmasa qayta yuborishga ruxsat bering.', [[button('🔢 E’lon ID sini kiritish', `adm:puf:${id}`)], [button('❌ E’lon yo‘q', `adm:pum:${id}`)]]);
      else if (p[1] === 'puf') { await this.setDraft(admin.telegramId, { kind: 'publication', publicationId: id }); await this.send(admin.telegramId, 'Tashqi e’lonning raqamli ID sini yuboring. Bekor qilish: /cancel'); }
      else if (p[1] === 'pum') { await this.recruiting.confirmMissing(this.identity(admin), id); await this.log(admin, 'TELEGRAM_ADMIN_PUBLICATION_MISSING', 'VACANCY_PUBLICATION', id); await this.send(admin.telegramId, 'E’lon yo‘qligi tasdiqlandi. Endi vakansiya nashrini qayta yuborishingiz mumkin.'); }
      else if (p[1] === 'tp') await this.telegramPreview(admin, id, Number(p[3]));
      else if (p[1] === 'tc') {
        const latest = await this.db.vacancy.findFirst({ where: { id, companyId: admin.companyId }, select: { revision: true, status: true } });
        if (!latest || latest.revision !== Number(p[4]) || latest.status !== 'ACTIVE') throw new Error('Vakansiya o‘zgargan. Nashr matnini qayta ko‘ring.');
        await this.recruiting.approve(this.identity(admin), id, { platform: 'TELEGRAM', channelId: Number(p[3]) });
        await this.log(admin, 'TELEGRAM_ADMIN_PUBLICATION_APPROVED', 'VACANCY', id, { channelId: Number(p[3]), revision: latest.revision });
        await this.publications(admin, id);
      }
      else if (p[1] === 'hh') await this.hhMenu(admin, id, Math.max(0, Math.min(10000, Number(p[3]) || 0)));
      else if (p[1] === 'hp') {
        const v = await this.db.vacancy.findFirst({ where: { id, companyId: admin.companyId } });
        if (!v || v.revision !== Number(p[3]) || !v.hhAreaId || !v.hhProfessionalRoleId) throw new Error('Vakansiya o‘zgargan.');
        const result = await this.hh.packages(admin.companyId, v.hhAreaId, v.hhProfessionalRoleId) as { publication_variants?: Array<{ suitable_packages?: Array<{ employer_service_id: string; count?: number; invalid?: boolean }> }> };
        const available = result.publication_variants?.flatMap(x => x.suitable_packages ?? []).filter(x => !x.invalid && (x.count ?? 0) > 0) ?? [];
        const selected = available[Number(p[4])];
        if (!selected) throw new Error('Paket endi mavjud emas.');
        const fingerprint = createHash('sha256').update(selected.employer_service_id).digest('hex').slice(0, 10);
        await this.send(admin.telegramId, `<b>${escapeHtml(v.title)}</b>\n${escapeHtml(v.description.slice(0, 2800))}\n\nhh.uz nashr paketi: ${escapeHtml(selected.employer_service_id)}\nQolgan soni: ${selected.count}\nTasdiqlaysizmi?`, [[button('✅ Tasdiqlash', `adm:hc:${id}:${v.revision}:${p[4]}:${fingerprint}`)]]);
      }
      else if (p[1] === 'hc') {
        const v = await this.db.vacancy.findFirst({ where: { id, companyId: admin.companyId } });
        if (!v || v.revision !== Number(p[3]) || v.status !== 'ACTIVE') throw new Error('Vakansiya o‘zgargan.');
        let employerServiceId: string | undefined;
        if (p[4] !== 'edit') {
          if (!v.hhAreaId || !v.hhProfessionalRoleId) throw new Error('hh.uz maydonlari to‘ldirilmagan.');
          const result = await this.hh.packages(admin.companyId, v.hhAreaId, v.hhProfessionalRoleId) as { publication_variants?: Array<{ suitable_packages?: Array<{ employer_service_id: string; count?: number; invalid?: boolean }> }> };
          employerServiceId = result.publication_variants?.flatMap(x => x.suitable_packages ?? []).filter(x => !x.invalid && (x.count ?? 0) > 0)[Number(p[4])]?.employer_service_id;
          if (!employerServiceId || createHash('sha256').update(employerServiceId).digest('hex').slice(0, 10) !== p[5]) throw new Error('Paket o‘zgargan. Qayta tanlang.');
        }
        await this.recruiting.approve(this.identity(admin), id, { platform: 'HEADHUNTER', employerServiceId });
        await this.log(admin, 'TELEGRAM_ADMIN_HH_APPROVED', 'VACANCY', id);
        await this.publications(admin, id);
      }
      else if (p[1] === 'vc') {
        const v = await this.db.vacancy.findFirst({ where: { id, companyId: admin.companyId, revision: Number(p[3]), status: 'ACTIVE' }, select: { title: true } });
        if (!v) throw new Error('Vakansiya o‘zgargan.');
        await this.send(admin.telegramId, `«${escapeHtml(v.title)}» vakansiyasini yopishni tasdiqlaysizmi? Tashqi e’lonlar ham yopishga yuboriladi.`, [[button('✅ Yopish', `adm:vcc:${id}:${p[3]}`)]]);
      }
      else if (p[1] === 'vcc') {
        const changed = await this.db.vacancy.updateMany({ where: { id, companyId: admin.companyId, revision: Number(p[3]), status: 'ACTIVE' }, data: { status: 'CLOSED', revision: { increment: 1 } } });
        if (!changed.count) throw new Error('Vakansiya o‘zgargan yoki allaqachon yopilgan.');
        await this.recruiting.vacancyChanged(admin.companyId, id, 'CLOSED');
        await this.log(admin, 'TELEGRAM_ADMIN_VACANCY_CLOSED', 'VACANCY', id);
        await this.vacancy(admin, id);
      }
      else if (p[1] === 'q') await this.assessment(admin, id);
      else if (p[1] === 'qr') {
        const v = await this.db.vacancy.findFirst({ where: { id, companyId: admin.companyId }, include: { requirements: true } });
        if (!v || v.status !== 'ACTIVE') throw new Error('Faol vakansiya topilmadi.');
        const existing = await this.draft(admin.telegramId);
        if (existing?.kind === 'question' && existing.vacancyId === id && existing.assessment) { await this.questionEditor(admin, existing); return true; }
        await this.security.limit(`telegram-admin-ai:${admin.id}`, 5, 3600);
        const lockKey = `telegram-admin-ai-lock:${admin.companyId}:${id}`;
        const lockValue = randomBytes(12).toString('hex');
        const locked = await this.security.redis.set(lockKey, lockValue, 'EX', 90, 'NX');
        if (locked !== 'OK') throw new Error('Bu vacancy uchun savollar hozir yaratilmoqda. Birozdan keyin qayta oching.');
        await this.send(admin.telegramId, '🤖 Lavozimga mos 10 savol yaratilmoqda...');
        try {
          const generated = await this.gemini.generate(vacancyAssessmentSchema, `Generate 10 screening assessment questions (5 Hard Skills + 5 Soft Skills) for the role "${v.title}".`, { title: v.title, description: v.description, requirements: v.requirements.map(r => ({ name: r.name })) }, assessmentInstructions);
          const state: Draft = { kind: 'question', vacancyId: v.id, vacancyRevision: v.revision, expectedVersion: v.assessmentEditVersion, assessment: generated, questionIndex: 0 };
          await this.setDraft(admin.telegramId, state);
          await this.questionEditor(admin, state);
        } finally {
          await this.security.redis.eval('if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0', 1, lockKey, lockValue);
        }
      }
      else if (p[1] === 'qe') {
        const v = await this.db.vacancy.findFirst({ where: { id, companyId: admin.companyId } });
        const parsed = v && v.assessmentRevision === v.revision ? vacancyAssessmentSchema.safeParse(v.assessmentQuestions) : null;
        if (!v || !parsed?.success || !parsed.data.questions[Number(p[3])]) throw new Error('Savollar hozir mavjud emas.');
        const state: Draft = { kind: 'question', vacancyId: v.id, vacancyRevision: v.revision, expectedVersion: v.assessmentEditVersion, assessment: parsed.data, questionIndex: Number(p[3]) };
        await this.setDraft(admin.telegramId, state);
        await this.questionEditor(admin, state);
      }
      else if (p[1] === 'qf') {
        const state = await this.draft(admin.telegramId);
        const field = p[2] as Draft['field'];
        if (!state?.assessment || !['question', 'explanation', 'option0', 'option1', 'option2', 'option3'].includes(field ?? '')) throw new Error('Tahrir sessiyasi tugagan.');
        state.field = field;
        await this.setDraft(admin.telegramId, state);
        await this.send(admin.telegramId, 'Yangi matnni yuboring (variant 1–500, savol va izoh 5–500 belgi). Bekor qilish: /cancel');
      }
      else if (p[1] === 'qn') {
        const state = await this.draft(admin.telegramId);
        if (!state?.assessment || !Number.isInteger(id) || id < 0 || id > 9) throw new Error('Tahrir sessiyasi tugagan.');
        state.questionIndex = id;
        state.field = undefined;
        await this.setDraft(admin.telegramId, state);
        await this.questionEditor(admin, state);
      }
      else if (p[1] === 'qo') {
        const state = await this.draft(admin.telegramId);
        if (!state?.assessment || state.questionIndex === undefined || ![0, 1, 2, 3].includes(id)) throw new Error('Tahrir sessiyasi tugagan.');
        state.assessment.questions[state.questionIndex].correctIndex = id;
        await this.setDraft(admin.telegramId, state);
        await this.questionEditor(admin, state);
      }
      else if (data === 'adm:qpreview') {
        const state = await this.draft(admin.telegramId);
        if (!state?.assessment) throw new Error('Tahrir sessiyasi tugagan.');
        await this.send(admin.telegramId, state.assessment.questions.map((q, i) => `${i + 1}. ${escapeHtml(q.question)} [${q.type}; ${'ABCD'[q.correctIndex]}]`).join('\n').slice(0, 3500), [[button('✅ Saqlash', `adm:qsave:${state.vacancyId}`)], [button('❌ Bekor', 'adm:cancel')]]);
      }
      else if (p[1] === 'qsave') {
        const state = await this.draft(admin.telegramId);
        if (!state?.assessment || state.vacancyId !== id || state.vacancyRevision === undefined || state.expectedVersion === undefined) throw new Error('Tahrir sessiyasi tugagan.');
        const valid = vacancyAssessmentSchema.parse(state.assessment);
        const updated = await this.db.vacancy.updateMany({
          where: { id, companyId: admin.companyId, revision: state.vacancyRevision, assessmentEditVersion: state.expectedVersion, status: 'ACTIVE' },
          data: { assessmentQuestions: valid as unknown as Prisma.InputJsonValue, assessmentRevision: state.vacancyRevision, assessmentEditVersion: { increment: 1 } },
        });
        if (!updated.count) throw new Error('Vakansiya yoki savollar o‘zgargan. Qayta ochib tahrirlang.');
        await this.clearDraft(admin.telegramId);
        await this.log(admin, 'TELEGRAM_ADMIN_ASSESSMENT_SAVED', 'VACANCY', id, { revision: state.vacancyRevision });
        await this.assessment(admin, id);
      }
      else if (data === 'adm:cancel') { await this.clearDraft(admin.telegramId); await this.menu(admin); }
      else if (p[1] === 'a') await this.applications(admin, id, Math.max(0, Math.min(10000, Number(p[3]) || 0)));
      else if (p[1] === 'ad') await this.application(admin, id);
      else if (p[1] === 'notify') await this.notifications(admin, Math.max(0, Math.min(10000, id || 0)));
      else if (p[1] === 'nt') {
        const all = await this.db.telegramBusinessConnection.findMany({ where: { companyId: admin.companyId, enabled: true, user: { companyId: admin.companyId, isActive: true, role: { in: ['ADMIN', 'HR', 'RECRUITER'] } } } });
        const matches = all.filter(c => this.connectionKey(c.id) === p[2]);
        if (matches.length !== 1) throw new Error('HR chati topilmadi.');
        const c = matches[0];
        const expected = p[3] === '1';
        const changed = await this.db.telegramBusinessConnection.updateMany({ where: { id: c.id, companyId: admin.companyId, screeningAlertsEnabled: expected }, data: { screeningAlertsEnabled: !expected } });
        if (!changed.count) throw new Error('Chat sozlamasi o‘zgargan. Ro‘yxatni yangilang.');
        await this.log(admin, 'TELEGRAM_ADMIN_ALERT_TARGET_CHANGED', 'TELEGRAM_CONNECTION', c.id, { enabled: !expected });
        await this.notifications(admin);
      }
      else if (p[1] === 'alerts') await this.alertList(admin, Math.max(0, Math.min(10000, id || 0)));
      else if (p[1] === 'alert') await this.alertDetail(admin, id);
      else if (['ar', 'as', 'am'].includes(p[1])) {
        const from = p[1] === 'ar' ? 'FAILED' : 'UNKNOWN';
        const to = p[1] === 'as' ? 'SENT' : 'PENDING';
        const changed = await this.db.telegramScreeningAlert.updateMany({ where: { id, companyId: admin.companyId, status: from }, data: { status: to, lastError: null, nextAttemptAt: new Date(), ...(to === 'SENT' ? { sentAt: new Date() } : {}) } });
        if (!changed.count) throw new Error('Xabar holati allaqachon o‘zgargan.');
        await this.log(admin, 'TELEGRAM_ADMIN_ALERT_RESOLVED', 'TELEGRAM_SCREENING_ALERT', id, { from, to });
        if (to === 'PENDING') void this.alerts.dispatch();
        await this.alertList(admin);
      }
      else if (data === 'adm:unlink') await this.send(admin.telegramId, 'Bot admin ulanishini uzishni tasdiqlaysizmi?', [[button('✅ Uzish', 'adm:unlink-confirm')], [button('❌ Bekor', 'adm:home')]]);
      else if (data === 'adm:unlink-confirm') { await this.disconnect(this.identity(admin)); await this.clearDraft(admin.telegramId); await this.send(admin.telegramId, 'Admin ulanishi uzildi.'); }
      else throw new Error('Eski tugma. /admin orqali menyuni qayta oching.');
    } catch (error) {
      await this.send(admin.telegramId, `⚠️ ${escapeHtml((error as Error).message).slice(0, 500)}`);
    }
    return true;
  }
}
