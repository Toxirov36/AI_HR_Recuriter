# Google orqali kirish

Google Identity Services popup yordamida login va register sahifalarida ishlaydi.
Backend Google Auth Library orqali ID token imzosi, audience, issuer va expiry'ni
tekshiradi. Brauzerga bog'langan bir martalik nonce qayta yuborishni bloklaydi.
Google access token/Client Secret kerak emas; Gmail yoki Drive ruxsati olinmaydi.

## Lokal sozlash

1. Google Cloud Console → Google Auth Platform → Branding: ilova nomi, support email.
2. Audience: External; Testing bo'lsa o'z emailingizni Test users'ga qo'shing.
3. Clients → Create client → Web application.
4. Authorized JavaScript origins:
   - `http://localhost`
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
5. Client ID'ni root `.env`ga qo'shing:
   `GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com`
6. `npm run db:migrate`, `npm run prisma:generate`, backendni restart qiling.

Popup usuli uchun redirect URI kerak emas. `.env`ni Git'ga qo'shmang.
Client ID bo'sh bo'lsa, Google tugmasi mavjud emas holatida qoladi.

## Hisoblar

- Google subject (`sub`) noyob va emaildan mustaqil saqlanadi.
- Mavjud Gmail/Google Workspace emaili tasdiqlansa hisob ulanishi mumkin;
  role va kompaniya saqlanadi. Google tasdiqlagan uchinchi tomon emaili
  mavjud hisobga avtomatik ulanmaydi: odatdagi parol bilan kirish kerak.
- Yangi Google foydalanuvchisi kompaniya va ismni tasdiqlaydi; yangi kompaniyada
  ADMIN bo'ladi. Mavjud kompaniyaga domain orqali avtomatik qo'shilmaydi.
- Taklifnoma sahifasi avvalgi email/parol oqimidan foydalanadi.
- Google hisobiga tasodifiy, foydalanuvchiga berilmaydigan parol hashi yoziladi;
  Google orqali kirish uchun parol talab qilinmaydi.

## Keyinchalik production uchun

OAuth client origins'ga `https://hr-recruiter.ddns.net` ni qo'shing, production
`.env`da GOOGLE_CLIENT_ID ni sozlang, migratsiya va deployni bajaring.
Frontend Nginx CSP Google GIS script/iframe ulanishlarini ruxsat qiladi;
COOP same-origin-allow-popups popup bilan aloqa qilishga imkon beradi.

Hujjatlar: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
va https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
