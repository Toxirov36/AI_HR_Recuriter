import { useEffect, useState, type FormEvent } from 'react';
import { BriefcaseBusiness, CheckCircle2, FileText, Layers3, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { Alert, Button, Input } from '../components/ui';

type PublicVacancy = {
  title: string;
  description: string;
  company: { name: string; retentionDays: number };
};

export function PublicApplyPage() {
  const token = window.location.pathname.split('/')[2];
  const [vacancy, setVacancy] = useState<PublicVacancy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [fileName, setFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    void api<PublicVacancy>(`/public/vacancies/${encodeURIComponent(token)}`)
      .then(setVacancy)
      .catch((cause) => setError((cause as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!String(data.get('email') || '').trim() && !String(data.get('phone') || '').trim()) {
      setError('Email yoki telefon raqamingizni kiriting.');
      return;
    }
    if (!selectedFile?.size || selectedFile.size > 5 * 1024 * 1024) {
      setError('PDF yoki DOCX CV tanlang (maksimal 5 MB).');
      return;
    }
    data.set('file', selectedFile);
    data.set('privacyAccepted', 'true');
    data.set('aiConsent', data.get('aiConsent') ? 'true' : 'false');
    setBusy(true);
    setError('');
    try {
      await api(`/public/vacancies/${encodeURIComponent(token)}/apply`, { method: 'POST', body: data });
      setDone(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f8f6] text-[#18352e]">
      <header className="border-b border-[#dfe8e3] bg-white px-5 py-5 sm:px-10">
        <div className="mx-auto flex max-w-5xl items-center gap-3 text-xl font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#245e4f] text-white"><Layers3 size={20} /></span>
          shortlist<span className="-ml-3 text-[#57ae88]">.</span>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-5 py-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)] lg:py-16">
        {loading ? <p>Vakansiya yuklanmoqda…</p> : vacancy ? (
          <>
            <section className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#e5f3ec] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#245e4f]"><BriefcaseBusiness size={14} /> Ochiq vakansiya</div>
              <p className="text-sm font-medium text-[#688078]">{vacancy.company.name}</p>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{vacancy.title}</h1>
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-[#4b6159]">{vacancy.description}</p>
            </section>
            <section className="rounded-2xl border border-[#dce7e0] bg-white p-6 shadow-sm sm:p-8">
              {done ? (
                <div role="status" className="space-y-3 py-10 text-center">
                  <CheckCircle2 size={44} className="mx-auto text-[#245e4f]" />
                  <h2 className="text-2xl font-semibold">Arizangiz qabul qilindi</h2>
                  <p className="text-sm text-[#60736b]">CV va kontaktlaringiz HR jamoasiga yetkazildi. Keyingi bosqich bo‘yicha ular siz bilan bog‘lanadi.</p>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-5">
                  <div><h2 className="text-2xl font-semibold">Ariza yuborish</h2><p className="mt-1 text-sm text-[#60736b]">Kontaktlaringiz va CV faylingizni qoldiring.</p></div>
                  <Alert message={error} />
                  <label className="block text-sm font-medium">To‘liq ism <Input name="fullName" required minLength={2} maxLength={160} autoComplete="name" className="mt-1.5" /></label>
                  <label className="block text-sm font-medium">Email <Input name="email" type="email" maxLength={254} autoComplete="email" className="mt-1.5" /></label>
                  <label className="block text-sm font-medium">Telefon raqam <Input name="phone" type="tel" autoComplete="tel" placeholder="+998 90 123 45 67" className="mt-1.5" /></label>
                  <p className="text-xs text-[#60736b]">Email yoki telefon raqamdan kamida bittasini kiriting.</p>
                  <label className="block cursor-pointer rounded-xl border border-dashed border-[#a9c5b5] bg-[#f8fbf9] p-5 text-center text-sm hover:border-[#245e4f]">
                    <FileText size={22} className="mx-auto mb-2 text-[#245e4f]" />
                    <span className="font-semibold">{fileName || 'CV yuklash · PDF yoki DOCX'}</span>
                    <span className="mt-1 block text-xs text-[#60736b]">Maksimal 5 MB</span>
                    <input name="file" type="file" accept=".pdf,.docx" required className="sr-only" onChange={(event) => { const file = event.target.files?.[0] ?? null; setSelectedFile(file); setFileName(file?.name ?? ''); }} />
                  </label>
                  <div className="space-y-3 border-t border-[#e5ece7] pt-5 text-sm leading-6 text-[#4b6159]">
                    <p><ShieldCheck size={16} className="mr-1.5 inline text-[#245e4f]" />{vacancy.company.name} kontaktlaringiz va CV’ingizdan shu vakansiya arizasini ko‘rib chiqish uchun foydalanadi. Ma’lumotlar ishchi hududda saqlanadi. Rad etilgan va muddati o‘tgan arizalar uchun anonimlashtirish mezoni {vacancy.company.retentionDays} kun; ko‘rib chiqilayotgan arizalar bundan uzoqroq saqlanishi mumkin. Yakuniy ishga qabul qilish qarorini HR xodimi qabul qiladi.</p>
                    <label className="flex items-start gap-2"><input type="checkbox" name="privacyAccepted" required className="mt-1" /><span>Ma’lumotlarim arizamni ko‘rib chiqish uchun ishlatilishiga roziman. <strong>*</strong></span></label>
                    <label className="flex items-start gap-2"><input type="checkbox" name="aiConsent" className="mt-1" /><span>Ixtiyoriy: CV’imdagi ishga oid ma’lumotlar Google Gemini orqali tartiblanishi, vakansiya talablari bilan dalillar asosida solishtirilishi va suhbat savollarini tayyorlashda ishlatilishiga roziman. AI avtomatik rad etish yoki ishga olish qarorini qabul qilmaydi.</span></label>
                  </div>
                  <Button type="submit" disabled={busy} className="w-full bg-[#245e4f] text-white hover:bg-[#1b4338]">{busy ? 'Yuborilmoqda…' : 'Arizani yuborish'}</Button>
                </form>
              )}
            </section>
          </>
        ) : <div><h1 className="text-2xl font-semibold">Vakansiya topilmadi</h1><Alert message={error} /></div>}
      </main>
    </div>
  );
}
