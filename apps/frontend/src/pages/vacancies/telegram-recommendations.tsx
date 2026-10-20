import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { api, send } from '../../lib/api';

type Recommendation = {
  telegramId: string;
  title: string;
  username: string;
  url: string;
  subscriberCount: number | null;
  score: number | null;
  reason: string;
  evidencePosts: number;
  checkedAt: string;
};
type DiscoveryStatus = {
  configured: boolean;
  run: null | {
    id: number;
    status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    stale: boolean;
    results: Recommendation[];
    error: string | null;
    createdAt: string;
    finishedAt: string | null;
  };
};

export function TelegramRecommendations({ vacancyId }: { vacancyId: number }) {
  const [data, setData] = useState<DiscoveryStatus | null>(null);
  const [sort, setSort] = useState<'fit' | 'subscribers'>('fit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = `/integrations/recruiting/vacancies/${vacancyId}/telegram`;
  const reload = useCallback(async () => {
    try { setData(await api<DiscoveryStatus>(`${base}/recommendations`)); setError(''); }
    catch (cause) { setError((cause as Error).message); }
  }, [base]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (data?.run?.status !== 'QUEUED' && data?.run?.status !== 'RUNNING') return;
    const timer = window.setInterval(() => void reload(), 3000);
    return () => window.clearInterval(timer);
  }, [data?.run?.status, reload]);

  const results = useMemo(() => [...(data?.run?.results ?? [])].sort((a, b) => sort === 'fit'
    ? (b.score ?? -1) - (a.score ?? -1) || (b.subscriberCount ?? -1) - (a.subscriberCount ?? -1)
    : (b.subscriberCount ?? -1) - (a.subscriberCount ?? -1) || (b.score ?? -1) - (a.score ?? -1)), [data?.run?.results, sort]);

  async function discover() {
    setBusy(true); setError('');
    try { await send(`${base}/discover`, {}); await reload(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  const run = data?.run;
  const running = run?.status === 'QUEUED' || run?.status === 'RUNNING';
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Mos Telegram kanallari">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Mos kanallarni topish</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">Ochiq kanallar vakansiya mavzusiga qarab baholanadi. Obunachilar soni moslik bahosiga kirmaydi.</p>
      </div>
      <button type="button" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1a5d4c] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#154a3d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5d4c] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || running || !data?.configured} onClick={() => void discover()}>
        {busy || running ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : run ? <RefreshCw size={16} aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
        {running ? 'Tahlil qilinmoqda…' : run ? 'Tahlilni yangilash' : 'Kanallarni tahlil qilish'}
      </button>
    </div>
    {data && !data.configured && <p className="rounded bg-amber-50 p-2 text-amber-800">Serverda Telegram qidiruv hisobi yoki AI sozlanmagan.</p>}
    {error && <p role="alert" className="rounded bg-red-50 p-2 text-red-700">{error}</p>}
    {running && <p role="status" className="text-blue-700">Kanallar qidirilmoqda va baholanmoqda…</p>}
    {run?.status === 'FAILED' && <p role="alert" className="rounded bg-red-50 p-2 text-red-700">{run.error ?? 'Tahlil yakunlanmadi.'}</p>}
    {run?.stale && <p className="rounded bg-amber-50 p-2 text-amber-800">Vakansiya o‘zgargan. Natijalar eskirgan; tahlilni yangilang.</p>}
    {run?.status === 'COMPLETED' && <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-sm font-medium text-slate-700">Saralash</span>
          <div role="group" aria-label="Kanallarni saralash" className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            <button type="button" aria-pressed={sort === 'fit'} onClick={() => setSort('fit')} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5d4c] ${sort === 'fit' ? 'bg-[#e7f3ee] dark:bg-[#17302a] text-[#175445] dark:text-[#58c0a0]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>Moslik</button>
            <button type="button" aria-pressed={sort === 'subscribers'} onClick={() => setSort('subscribers')} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5d4c] ${sort === 'subscribers' ? 'bg-[#e7f3ee] dark:bg-[#17302a] text-[#175445] dark:text-[#58c0a0]' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>Obunachilar</button>
          </div>
        </div>
        {run.finishedAt && <span className="text-xs text-slate-500">Tahlil: {new Date(run.finishedAt).toLocaleString()}</span>}
      </div>
      {results.length ? <div className="space-y-2">{results.map(channel => <div key={channel.telegramId} className="rounded-lg border p-3 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <a href={channel.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">{channel.title} · @{channel.username}</a>
          <span>{channel.score === null ? 'Moslik: ma’lumot kam' : `Moslik: ${channel.score}/100`}</span>
        </div>
        <p>{channel.reason}</p>
        <p className="text-xs text-slate-600">Obunachilar: {channel.subscriberCount === null ? 'noma’lum' : channel.subscriberCount.toLocaleString()} · Tahlil qilingan postlar: {channel.evidencePosts} · Tekshirildi: {new Date(channel.checkedAt).toLocaleString()}</p>
      </div>)}</div> : <p className="text-slate-600">Ochiq kanallar orasida yetarlicha mos va ishonchli tavsiya topilmadi. Keyinroq tahlilni yangilab ko‘ring.</p>}
    </>}
  </section>;
}
