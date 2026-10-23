import { describe, expect, it, vi } from 'vitest';
import type { StoredInterview } from '../ai/schemas/interview.schema';
import { TelegramScreeningAlertService } from './telegram-screening-alert.service';
import { buildHrCard, hrCardKeyboard, transcriptText } from './telegram-hr-card';

const candidate = { fullName: 'Ali <Valiyev>', phone: '+998901234567', email: null };
const test = { score: 80, hardSkillScore: 90, softSkillScore: 70 };
const interview = (verdict: 'recommend' | 'consider' | 'reject', score: number, extra: Partial<StoredInterview> = {}): StoredInterview => ({
  turns: [{ role: 'ai', text: 'Salom!' }, { role: 'candidate', text: 'Men SMM bilan ishlaganman' }],
  evaluation: {
    score, verdict, reason: 'Aniq misollar keltirdi', summary: 'Tajribali nomzod.',
    strengths: ['Reels tajribasi', 'Natijaga yo‘naltirilgan', 'Jamoada ishlaydi', 'To‘rtinchi'],
    weaknesses: ['Analitika kam'], risks: ['Maosh kutilmasi yuqori'], checkQuestions: ['Oxirgi kampaniya natijasi qanday?'],
  },
  finishedAt: '2026-10-23T10:00:00Z',
  ...extra,
});

describe('HR card', () => {
  it('stays the plain test card without an interview', () => {
    const card = buildHrCard({ candidate, vacancyTitle: 'SMM', test, interview: null, viewUrl: 'https://hrdai.uz/applications/9' });
    expect(card).toContain('Testdan o‘tgan nomzod');
    expect(card).toContain('Ali &lt;Valiyev&gt;');
    expect(card).toContain('Test: <b>80%</b> · Hard: 90% · Soft: 70%');
    expect(card).not.toContain('AI suhbat');
    expect(card).not.toContain('http');
  });

  it('shows the recommendation, combined score, strengths, risks and what to check in person', () => {
    const card = buildHrCard({ candidate, vacancyTitle: 'SMM', test, interview: interview('recommend', 85), viewUrl: 'https://hrdai.uz/applications/9' });
    expect(card).toContain('✅ Tavsiya etiladi');
    expect(card).toContain('AI suhbat: <b>85%</b> · ✨ Umumiy: <b>83%</b>');
    expect(card).toContain('• Reels tajribasi');
    expect(card).not.toContain('To‘rtinchi'); // at most three per list
    expect(card).toContain('🚩 <b>Xavflar</b>');
    expect(card).toContain('❓ <b>Uchrashuvda tekshiring</b>');
    expect(card.length).toBeLessThanOrEqual(3900);
  });

  it('turns red on a rejecting verdict or a low total, and yellow otherwise', () => {
    const badge = (verdict: 'recommend' | 'consider' | 'reject', score: number) =>
      buildHrCard({ candidate, vacancyTitle: 'SMM', test, interview: interview(verdict, score), viewUrl: 'https://x' }).split('\n')[0];
    expect(badge('reject', 90)).toContain('❌');
    expect(badge('consider', 70)).toContain('⚠️');
    expect(badge('recommend', 20)).toContain('❌'); // 0.4*80 + 0.6*20 = 44
  });

  it('says so when the interview could not be evaluated, and links the profile in text on a non-https site', () => {
    const card = buildHrCard({ candidate, vacancyTitle: 'SMM', test, interview: interview('consider', 0, { evaluation: null, skipped: true }), viewUrl: 'http://localhost:5173/applications/9' });
    expect(card).toContain('baholanmadi');
    expect(card).toContain('http://localhost:5173/applications/9');
  });

  it('builds the buttons: profile (https only), invite and reject', () => {
    expect(JSON.stringify(hrCardKeyboard(9, 'https://hrdai.uz/applications/9'))).toContain('"url":"https://hrdai.uz/applications/9"');
    const local = hrCardKeyboard(9, 'http://localhost:5173/applications/9');
    expect(local.inline_keyboard.flat().some((button) => 'url' in button)).toBe(false);
    expect(local.inline_keyboard.flat().map((button) => button.callback_data)).toEqual(['action:interview:9', 'action:reject:9']);
  });

  it('writes the transcript with the candidate’s name', () => {
    expect(transcriptText(interview('consider', 50), 'Ali')).toBe('AI: Salom!\n\nAli: Men SMM bilan ishlaganman');
  });
});

describe('alert dispatch with an interview', () => {
  const alert = {
    id: 1, companyId: 3, applicationId: 9, chatId: '100', status: 'PENDING', attempts: 0,
    application: { id: 9, companyId: 3, assessmentResult: { score: 80, hardSkillScore: 90, softSkillScore: 70 }, aiInterview: interview('recommend', 85), candidate, vacancy: { title: 'SMM' } },
  };
  const dbFor = () => ({
    telegramBusinessConnection: { findFirst: vi.fn().mockResolvedValue({ id: 'conn-1' }) },
    telegramScreeningAlert: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findMany: vi.fn().mockResolvedValue([alert]), update: vi.fn() },
  });

  it('sends the rich card with buttons, then the transcript file', async () => {
    const db = dbFor();
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), sendDocument: vi.fn().mockResolvedValue({ ok: true }) };
    await new TelegramScreeningAlertService(db as never, telegram as never).dispatch();
    const [chat, text, options] = telegram.sendMessage.mock.calls[0];
    expect(chat).toBe('100');
    expect(text).toContain('✅ Tavsiya etiladi');
    expect(options.replyMarkup.inline_keyboard.flat().map((b: any) => b.callback_data).filter(Boolean)).toContain('action:reject:9');
    expect(telegram.sendDocument).toHaveBeenCalledWith('100', { name: 'suhbat-9.txt', content: expect.stringContaining('Ali <Valiyev>: Men SMM bilan ishlaganman') }, { caption: 'AI suhbat transkripti' });
    expect(db.telegramScreeningAlert.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ status: 'SENT' }) });
  });

  it('still counts the alert as sent when the transcript file fails', async () => {
    const db = dbFor();
    const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), sendDocument: vi.fn().mockRejectedValue(new Error('too big')) };
    await new TelegramScreeningAlertService(db as never, telegram as never).dispatch();
    expect(db.telegramScreeningAlert.update).toHaveBeenCalledWith({ where: { id: 1 }, data: expect.objectContaining({ status: 'SENT' }) });
  });
});
