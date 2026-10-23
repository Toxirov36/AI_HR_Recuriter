import {
  combinedScore,
  recommendationOf,
  type InterviewEvaluation,
  type Recommendation,
  type StoredInterview,
} from '../ai/schemas/interview.schema';

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

export type HrCardInput = {
  candidate: { fullName: string; phone?: string | null; email?: string | null };
  vacancyTitle: string;
  test: { score: number; hardSkillScore?: number; softSkillScore?: number };
  interview: StoredInterview | null;
  viewUrl: string;
};

const BADGES: Record<Recommendation, string> = {
  HIRE: '✅ Tavsiya etiladi',
  MAYBE: '⚠️ Qo‘shimcha tekshiruv kerak',
  NO: '❌ Tavsiya etilmaydi',
};

function bullets(title: string, items: string[]) {
  const shown = items.slice(0, 3).map((item) => `• ${escapeHtml(clip(item, 180))}`);
  return shown.length ? `\n${title}\n${shown.join('\n')}` : '';
}

/** The HR's Telegram card for a candidate who finished the bot flow. Without an interview it is the plain test card. */
export function buildHrCard({ candidate, vacancyTitle, test, interview, viewUrl }: HrCardInput): string {
  const evaluation: InterviewEvaluation | null = interview?.evaluation ?? null;
  const contact = [candidate.phone, candidate.email].filter(Boolean).join(' / ') || 'Kiritilmagan';
  const combined = combinedScore(test.score, evaluation?.score);
  const header = evaluation
    ? `${BADGES[recommendationOf(evaluation, combined)]}\n🎯 <b>Nomzod tayyor</b>`
    : '🎯 <b>Testdan o‘tgan nomzod</b>';
  const lines = [
    header,
    '',
    `👤 ${escapeHtml(candidate.fullName)}`,
    `💼 ${escapeHtml(vacancyTitle)}`,
    `📞 ${escapeHtml(contact)}`,
    `📊 Test: <b>${test.score}%</b> · Hard: ${test.hardSkillScore ?? 0}% · Soft: ${test.softSkillScore ?? 0}%`,
  ];
  if (evaluation) {
    lines.push(`🎤 AI suhbat: <b>${evaluation.score}%</b>${combined !== null ? ` · ✨ Umumiy: <b>${combined}%</b>` : ''}`);
    if (evaluation.summary) lines.push('', escapeHtml(clip(evaluation.summary, 400)));
    if (evaluation.reason) lines.push('', `<b>Sabab:</b> ${escapeHtml(clip(evaluation.reason, 300))}`);
    const extra =
      bullets('✅ <b>Kuchli tomonlar</b>', evaluation.strengths) +
      bullets('⚠️ <b>Zaif tomonlar</b>', evaluation.weaknesses) +
      bullets('🚩 <b>Xavflar</b>', evaluation.risks) +
      bullets('❓ <b>Uchrashuvda tekshiring</b>', evaluation.checkQuestions);
    if (extra) lines.push(extra);
  } else if (interview) {
    lines.push('🎤 AI suhbat: baholanmadi (nomzod o‘tkazib yubordi yoki AI ishlamadi)');
  }
  if (!viewUrl.startsWith('https://')) lines.push('', `HR ko‘rib chiqishi: ${escapeHtml(viewUrl)}`);
  return lines.join('\n').slice(0, 3900);
}

/** Buttons under the card. The profile link is a URL button only when the site is on https (Telegram requires it). */
export function hrCardKeyboard(applicationId: number, viewUrl: string) {
  const rows: Array<Array<Record<string, string>>> = [];
  if (viewUrl.startsWith('https://')) rows.push([{ text: '👁 Ko‘rish', url: viewUrl }]);
  rows.push([
    { text: '📅 Suhbatga chaqirish', callback_data: `action:interview:${applicationId}` },
    { text: '✖️ Rad etish', callback_data: `action:reject:${applicationId}` },
  ]);
  return { inline_keyboard: rows };
}

/** The interview as a plain-text file for HR. */
export function transcriptText(interview: StoredInterview, candidateName: string): string {
  return interview.turns.map((turn) => `${turn.role === 'ai' ? 'AI' : candidateName}: ${turn.text}`).join('\n\n');
}
