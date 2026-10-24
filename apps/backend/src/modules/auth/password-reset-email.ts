export type ResetLang = 'uz' | 'en' | 'ru' | 'tg';

const copy: Record<ResetLang, { subject: string; intro: string; expiry: string }> = {
  uz: {
    subject: 'Shortlist: parolni tiklash kodi',
    intro: 'Parolni tiklash uchun quyidagi kodni saytga kiriting:',
    expiry: 'Kod 15 daqiqa amal qiladi.',
  },
  en: {
    subject: 'Shortlist: password reset code',
    intro: 'Enter this code on the site to reset your password:',
    expiry: 'The code is valid for 15 minutes.',
  },
  ru: {
    subject: 'Shortlist: код для сброса пароля',
    intro: 'Введите этот код на сайте, чтобы сбросить пароль:',
    expiry: 'Код действует 15 минут.',
  },
  tg: {
    subject: 'Shortlist: рамзи барқарор кардани парол',
    intro: 'Барои барқарор кардани парол ин рамзро дар сайт ворид кунед:',
    expiry: 'Рамз 15 дақиқа эътибор дорад.',
  },
};

/** The reset email: plain text plus a minimal HTML version with the code set large. */
export function passwordResetEmail(code: string, lang: ResetLang = 'uz') {
  const t = copy[lang] ?? copy.uz;
  const text = `${t.intro}\n\n${code}\n\n${t.expiry}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#0f1a14;max-width:480px">
<p style="font-size:16px">${t.intro}</p>
<p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
<p style="font-size:14px;color:#4f5d55">${t.expiry}</p>
</div>`;
  return { subject: t.subject, text, html };
}
