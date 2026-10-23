import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, send } from '../../lib/api';
import { Modal } from '../../components/ui';
import { useAuth } from '../../features/auth';
import type { Vacancy } from '../../types';
import { TelegramRecommendations } from './telegram-recommendations';

type Publication = { id: number; platform: 'TELEGRAM' | 'HEADHUNTER'; destinationKey: string; status: string; approvedRevision: number | null; externalUrl: string | null; error: string | null };
type Channel = { id: number; chatId: string; title: string; username: string | null };
type Preview = {
  vacancy: { id: number; status: string; revision: number; hhSearchCount: number | null; hhSearchedAt: string | null; hhSearchError: string | null };
  telegram: Array<{ channel: Channel; text: string | null }>;
  botApplicationUrl: string | null;
  headhunter: { configured: boolean; connected: boolean; employerId: string | null; connectedByUserId: number | null };
  publications: Publication[];
};
type Package = { employer_service_id: string; count: number; invalid?: boolean };
type Packages = { publication_variants?: Array<{ appearance?: { title?: string }; suitable_packages?: Package[] }> };
type ResumeResults = { total: number; items: Array<{ id: string; title: string; url: string | null; area: string; updatedAt: string | null }> };

export function PublicationModal({ vacancy, close }: { vacancy: Vacancy; close: () => void }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const statusLabel = (status: string) => t(`publication.status.${status}`, status);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [packages, setPackages] = useState<Packages | null>(null);
  const [selectedPackage, setSelectedPackage] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [foundIds, setFoundIds] = useState<Record<number, string>>({});
  const [results, setResults] = useState<ResumeResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = `/integrations/recruiting`;

  const reload = useCallback(async () => {
    try { setPreview(await api<Preview>(`${base}/vacancies/${vacancy.id}/preview`)); }
    catch (cause) { setError((cause as Error).message); }
  }, [vacancy.id]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!preview?.publications.some(item => item.status === 'QUEUED' || item.status === 'SENDING' || item.status === 'UNKNOWN')) return;
    const timer = window.setInterval(() => void reload(), 5000);
    return () => window.clearInterval(timer);
  }, [preview?.publications, reload]);
  useEffect(() => {
    if (!preview?.headhunter.connected || preview.headhunter.connectedByUserId !== user?.id) return;
    const params = new URLSearchParams();
    if (vacancy.hhAreaId) params.set('areaId', vacancy.hhAreaId);
    if (vacancy.hhProfessionalRoleId) params.set('roleId', vacancy.hhProfessionalRoleId);
    void api<Packages>(`${base}/headhunter/packages?${params}`).then(setPackages).catch(cause => setError((cause as Error).message));
  }, [preview?.headhunter.connected, preview?.headhunter.connectedByUserId, user?.id, vacancy.hhAreaId, vacancy.hhProfessionalRoleId]);

  async function action(work: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await work(); await reload(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  const stateFor = (platform: Publication['platform'], destinationKey: string) => preview?.publications.find(item => item.platform === platform && item.destinationKey === destinationKey);
  const uncertainControls = (record?: Publication) => record?.status === 'UNKNOWN' && user?.role === 'ADMIN' ? <div className="space-y-2 rounded bg-amber-50 p-2">
    <p>{t('publication.uncertainHint', 'Platformada e’lon borligini tekshiring. Bor bo‘lsa uning raqamli ID sini kiriting.')}</p>
    <div className="flex gap-2"><input className="min-w-0 flex-1 rounded border px-2 py-1" aria-label={t('publication.foundIdAria', 'Mavjud e’lon ID si')} placeholder={t('publication.foundIdPlaceholder', 'E’lon ID si')} value={foundIds[record.id] ?? ''} onChange={event => setFoundIds(current => ({ ...current, [record.id]: event.target.value }))} /><button type="button" className="rounded border px-3 py-2" disabled={busy || !/^\d{1,20}$/.test(foundIds[record.id] ?? '')} onClick={() => void action(() => send(`${base}/publications/${record.id}/confirm-found`, { externalId: foundIds[record.id] }))}>{t('publication.linkExisting', 'Mavjud e’lonni bog‘lash')}</button></div>
    <button type="button" className="rounded border px-3 py-2" disabled={busy} onClick={() => { if (window.confirm(t('publication.confirmMissingPrompt', 'Platformada bu e’lon yo‘qligini tekshirdingizmi?'))) void action(() => send(`${base}/publications/${record.id}/confirm-missing`, {})); }}>{t('publication.confirmMissing', 'E’lon yo‘qligini tasdiqlash')}</button>
  </div> : null;

  return <Modal title={t('publication.title', 'Platformalarda e’lon qilish')} subtitle={vacancy.title} close={close} className="max-w-[780px]">
    <div className="overflow-y-auto space-y-5 pr-1 text-sm">
      {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      {vacancy.status !== 'ACTIVE' && <p className="rounded-lg bg-amber-50 p-3 text-amber-800">{t('publication.activateFirst', 'E’lon qilish uchun vacancy holatini Active qiling.')}</p>}

      <section className="rounded-xl border border-slate-200 p-4 space-y-3">
        <h3 className="font-semibold text-base">{t('publication.telegramChannels', 'Telegram kanallari')}</h3>
        {preview?.telegram.length ? preview.telegram.map(({ channel, text }) => {
          const record = stateFor('TELEGRAM', channel.chatId);
          return <div key={channel.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2"><strong>{channel.title}</strong><span>{record ? statusLabel(record.status) : t('publication.notPublished', 'Nashr qilinmagan')}</span></div>
            {text && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{text}</pre>}
            {record?.externalUrl && <a className="text-blue-700 underline" href={record.externalUrl} target="_blank" rel="noreferrer">{t('publication.openPost', 'E’lonni ochish')}</a>}
            {record?.error && <p className="text-red-700">{record.error}</p>}
            <div className="flex gap-2">
              <button type="button" className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" disabled={busy || vacancy.status !== 'ACTIVE' || record?.status === 'QUEUED' || record?.status === 'SENDING' || record?.status === 'UNKNOWN' || (record?.status === 'PUBLISHED' && record.approvedRevision === preview?.vacancy.revision)} onClick={() => void action(() => send(`${base}/vacancies/${vacancy.id}/approve`, { platform: 'TELEGRAM', channelId: channel.id }))}>
                {record?.status === 'STALE' ? t('publication.confirmUpdate', 'Yangilashni tasdiqlash') : record?.status === 'FAILED' ? t('publication.retry', 'Qayta urinish') : t('publication.confirmPublish', 'E’lon qilishni tasdiqlash')}
              </button>
              {user?.role === 'ADMIN' && <button type="button" className="rounded border px-3 py-2" disabled={busy} onClick={() => void action(() => api(`${base}/telegram/channels/${channel.id}`, { method: 'DELETE' }))}>{t('publication.disconnectChannel', 'Kanalni uzish')}</button>}
            </div>
            {uncertainControls(record)}
          </div>;
        }) : <p className="text-slate-600">{t('publication.noChannel', 'Kanal ulanmagan.')}</p>}
        {user?.role === 'ADMIN' && <div className="space-y-2 border-t pt-3">
          <p className="text-slate-600">{t('publication.addChannelHint', 'Botni kanalda e’lon joylash huquqi bilan administrator qiling. So‘ng kanal @nomi yoki ID sini kiriting.')}</p>
          <div className="flex gap-2"><input className="min-w-0 flex-1 rounded border px-3 py-2" value={newChannel} onChange={event => setNewChannel(event.target.value)} placeholder={t('publication.channelPlaceholder', '@kanal_nomi')} aria-label={t('publication.channelAria', 'Telegram kanal nomi yoki ID')} /><button className="rounded border px-3 py-2" type="button" disabled={busy || !newChannel.trim()} onClick={() => void action(async () => { await send(`${base}/telegram/channels`, { chatId: newChannel.trim() }); setNewChannel(''); })}>{t('publication.connectChannel', 'Kanalni ulash')}</button></div>
        </div>}
      </section>

      <TelegramRecommendations vacancyId={vacancy.id} />

      <section className="rounded-xl border border-slate-200 p-4 space-y-3">
        <h3 className="font-semibold text-base">{t('publication.hhTitle', 'HeadHunter (hh.uz)')}</h3>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{vacancy.title}{'\n\n'}{vacancy.description}</pre>
        {preview?.botApplicationUrl && <p className="text-slate-600">{t('publication.botLinkLabel', 'Nomzodlar uchun bot havolasi:')} <a className="text-blue-700 underline break-all" href={preview.botApplicationUrl} target="_blank" rel="noreferrer">{preview.botApplicationUrl}</a>. {t('publication.botLinkNote', 'hh.uz e’lonida tashqi havoladan foydalanish imkonini hisob ulangach tekshiring.')}</p>}
        {preview?.vacancy.hhSearchedAt && <p className="text-slate-600">{t('publication.dailySearch', { defaultValue: 'Kunlik qidiruv: {{result}} · {{date}}', result: preview.vacancy.hhSearchError ? t('publication.dailySearchError', { defaultValue: 'xato — {{error}}', error: preview.vacancy.hhSearchError }) : t('publication.dailySearchCount', { defaultValue: '{{total}} ta natija', total: preview.vacancy.hhSearchCount ?? 0 }), date: new Date(preview.vacancy.hhSearchedAt).toLocaleString() })}</p>}
        {!preview?.headhunter.configured ? <p className="text-slate-600">{t('publication.hhNotConfigured', 'HH API hali serverda sozlanmagan.')}</p> : !preview.headhunter.connected ? <div className="space-y-2"><p className="text-slate-600">{t('publication.hhNotConnected', 'Ish beruvchi hisobi ulanmagan.')}</p>{user?.role === 'ADMIN' && <button type="button" className="rounded border px-3 py-2" disabled={busy} onClick={() => void action(async () => { const result = await send<{ url: string }>(`${base}/headhunter/connect`, {}); window.location.assign(result.url); })}>{t('publication.connectHh', 'hh.uz hisobini ulash')}</button>}</div> : <>
          <p>{t('publication.connectedEmployer', { defaultValue: 'Ulangan ish beruvchi: {{id}}', id: preview.headhunter.employerId })}</p>
          {preview.headhunter.connectedByUserId !== user?.id ? <p className="text-slate-600">{t('publication.managerOnly', 'HH natijalarini hisobni ulagan menejer ko‘ra oladi.')}</p> : <>
            {!vacancy.hhAreaId || !vacancy.hhProfessionalRoleId || !vacancy.hhExperienceId || !vacancy.hhEmploymentId || !vacancy.hhScheduleId ? <p className="text-amber-700">{t('publication.fillHhFields', 'Vacancy tahririda HH maydonlarini to‘ldiring.')}</p> : <>
              <label className="block">{t('publication.packageLabel', 'Nashr paketi')}
                <select className="mt-1 w-full rounded border p-2" value={selectedPackage} onChange={event => setSelectedPackage(event.target.value)}>
                  <option value="">{t('publication.packageChoose', 'Paketni tanlang')}</option>
                  {packages?.publication_variants?.flatMap((variant, index) => (variant.suitable_packages ?? []).filter(pkg => !pkg.invalid && pkg.count > 0).map(pkg => <option key={`${index}-${pkg.employer_service_id}`} value={pkg.employer_service_id}>{t('publication.packageOption', { defaultValue: '{{title}} · {{total}} ta mavjud', title: variant.appearance?.title ?? t('publication.packageLabel', 'Nashr paketi'), total: pkg.count })}</option>))}
                </select>
              </label>
              {packages && !packages.publication_variants?.some(variant => variant.suitable_packages?.some(pkg => !pkg.invalid && pkg.count > 0)) && <p className="text-amber-700">{t('publication.noPackage', 'Mos nashr paketi mavjud emas. hh.uz xizmatlarini tekshiring.')}</p>}
              {(() => { const record = stateFor('HEADHUNTER', preview.headhunter.employerId!); return <div className="space-y-2"><p>{t('publication.statusLine', { defaultValue: 'Holat: {{status}}', status: record ? statusLabel(record.status) : t('publication.notPublished', 'Nashr qilinmagan') })}</p>{record?.externalUrl && <a className="text-blue-700 underline" href={record.externalUrl} target="_blank" rel="noreferrer">{t('publication.openHhPost', 'hh.uz e’lonini ochish')}</a>}{record?.error && <p className="text-red-700">{record.error}</p>}<button type="button" className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" disabled={busy || (!selectedPackage && (!record?.externalUrl || record.status === 'CLOSED')) || vacancy.status !== 'ACTIVE' || record?.status === 'QUEUED' || record?.status === 'SENDING' || record?.status === 'UNKNOWN' || (record?.status === 'PUBLISHED' && record.approvedRevision === preview?.vacancy.revision)} onClick={() => void action(() => send(`${base}/vacancies/${vacancy.id}/approve`, { platform: 'HEADHUNTER', employerServiceId: selectedPackage }))}>{t('publication.approveHh', 'hh.uz ga chiqarishni tasdiqlash')}</button>{uncertainControls(record)}</div>; })()}
            </>}
            <div className="border-t pt-3 space-y-2"><button type="button" className="rounded border px-3 py-2" disabled={busy || vacancy.status !== 'ACTIVE'} onClick={() => void action(async () => { setResults(await api<ResumeResults>(`${base}/vacancies/${vacancy.id}/headhunter/resumes`)); })}>{t('publication.searchResumes', 'Mos rezyumelarni qidirish')}</button>
              {results && <><p>{t('publication.found', { defaultValue: 'Topildi: {{total}}', total: results.total })}</p>{results.items.map(item => <div key={item.id} className="flex justify-between gap-3 border-b py-2"><span>{item.title} · {item.area}</span>{item.url && <a className="shrink-0 text-blue-700 underline" href={item.url} target="_blank" rel="noreferrer">{t('publication.openOnHh', 'hh.uz’da ochish')}</a>}</div>)}</>}
            </div>
          </>}
        </>}
      </section>
      {!!preview?.publications.length && <section className="rounded-xl border border-slate-200 p-4 space-y-2">
        <h3 className="font-semibold text-base">{t('publication.history', 'Nashrlar tarixi')}</h3>
        {preview.publications.map(item => <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2">
          <span>{item.platform === 'TELEGRAM' ? 'Telegram' : 'hh.uz'} · {item.destinationKey}</span>
          <strong>{statusLabel(item.status)}</strong>
          {item.externalUrl && <a className="text-blue-700 underline" href={item.externalUrl} target="_blank" rel="noreferrer">{t('publication.openPost', 'E’lonni ochish')}</a>}
          {item.error && <span className="text-red-700">{item.error}</span>}
        </div>)}
      </section>}
      <p className="text-xs text-slate-500">{t('publication.olxNote', 'OLX.uz integratsiyasi API kirishi tasdiqlangach qo‘shiladi.')}</p>
    </div>
  </Modal>;
}
