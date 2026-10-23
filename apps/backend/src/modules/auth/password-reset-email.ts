export type ResetLang = 'uz' | 'en' | 'ru' | 'tg';

const copy: Record<ResetLang, { subject: string; intro: string; expiry: string; ignore: string }> = {
  uz: {
    subject: 'Shortlist: parolni tiklash kodi',
    intro: 'Parolni tiklash uchun quyidagi kodni saytga kiriting:',
    expiry: 'Kod 15 daqiqa amal qiladi.',
    ignore: "Agar buni siz so'ramagan bo'lsangiz, xatga e'tibor bermang: parolingiz o'zgarmaydi.",
  },
  en: {
    subject: 'Shortlist: password reset code',
    intro: 'Enter this code on the site to reset your password:',
    expiry: 'The code is valid for 15 minutes.',
    ignore: "If you didn't request this, ignore this email: your password stays the same.",
  },
  ru: {
    subject: 'Shortlist: код для сброса пароля',
    intro: 'Введите этот код на сайте, чтобы сбросить пароль:',
    expiry: 'Код действует 15 минут.',
    ignore: 'Если вы не запрашивали сброс, просто проигнорируйте письмо: пароль не изменится.',
  },
  tg: {
    subject: 'Shortlist: рамзи барқарор кардани парол',
    intro: 'Барои барқарор кардани парол ин рамзро дар сайт ворид кунед:',
    expiry: 'Рамз 15 дақиқа эътибор дорад.',
    ignore: 'Агар шумо инро дархост накарда бошед, ба мактуб аҳамият надиҳед: пароли шумо тағйир намеёбад.',
  },
};

/** The reset email: plain text plus a minimal HTML version with the code set large. */
export function passwordResetEmail(code: string, lang: ResetLang = 'uz') {
  const t = copy[lang] ?? copy.uz;
  const text = `${t.intro}\n\n${code}\n\n${t.expiry}\n${t.ignore}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#0f1a14;max-width:480px">
<p style="font-size:16px">${t.intro}</p>
<p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
<p style="font-size:14px;color:#4f5d55">${t.expiry}<br>${t.ignore}</p>
</div>`;
  return { subject: t.subject, text, html };
}
