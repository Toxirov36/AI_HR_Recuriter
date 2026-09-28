import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Sparkles,
  CalendarCheck,
  Send,
  UserCheck,
  Inbox,
  ArrowRight,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useData } from '../lib/query-client';

export interface AppNotification {
  id: string;
  type: 'NEW_APPLICATION' | 'STRONG_MATCH' | 'STAGE_INTERVIEW' | 'TELEGRAM_CV';
  title: string;
  subtitle: string;
  link: string;
  createdAt: string;
  badge?: string;
  matchScore?: number;
}

function timeAgo(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Hozirgina';
  if (diffMins < 60) return `${diffMins}m oldin`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}s oldin`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Kecha';
  if (diffDays < 7) return `${diffDays} kun oldin`;
  return new Date(dateString).toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' });
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data, reload } = useData<{ items: AppNotification[] }>('/v1/notifications');

  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('shortlist_read_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const notifications = useMemo(() => data?.items || [], [data?.items]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !readIds.includes(n.id)).length;
  }, [notifications, readIds]);

  const markAllAsRead = () => {
    const allIds = notifications.map((n) => n.id);
    setReadIds(allIds);
    try {
      localStorage.setItem('shortlist_read_notifications', JSON.stringify(allIds));
    } catch {}
  };

  const handleItemClick = (item: AppNotification) => {
    if (!readIds.includes(item.id)) {
      const next = [...readIds, item.id];
      setReadIds(next);
      try {
        localStorage.setItem('shortlist_read_notifications', JSON.stringify(next));
      } catch {}
    }
    setOpen(false);
    navigate(item.link);
  };

  useEffect(() => {
    if (open) {
      void reload();
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="topbar-icon-btn relative cursor-pointer outline-none hover:bg-slate-100 transition-colors"
          aria-label="Notifications"
          title="Bildirishnomalar"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white"
              aria-label={`${unreadCount} o'qilmagan bildirishnoma`}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[370px] sm:w-[410px] p-0 shadow-2xl border border-slate-200/80 rounded-2xl bg-white overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-900">Bildirishnomalar</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                {unreadCount} yangi
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-[#1a5d4c] transition-colors"
            >
              <CheckCheck size={14} />
              O'qilgan deb belgilash
            </button>
          )}
        </div>

        <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100/80">
          {data === undefined && !notifications.length ? (
            <div className="p-6 text-center text-xs text-slate-400">Yuklanmoqda…</div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <Inbox size={22} />
              </div>
              <p className="text-sm font-medium text-slate-700">Hozircha yangi bildirishnoma yo'q</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
                Nomzodlar ariza topshirganda yoki bosqichlar o'zgarganda bu yerda aks etadi.
              </p>
            </div>
          ) : (
            notifications.map((item) => {
              const isUnread = !readIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`flex items-start gap-3 p-3.5 cursor-pointer transition-colors hover:bg-slate-50 ${
                    isUnread ? 'bg-emerald-50/25' : ''
                  }`}
                  role="button"
                  tabIndex={0}
                >
                  <div className="mt-0.5 shrink-0">
                    {item.type === 'STRONG_MATCH' && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                        <Sparkles size={16} />
                      </div>
                    )}
                    {item.type === 'STAGE_INTERVIEW' && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <CalendarCheck size={16} />
                      </div>
                    )}
                    {item.type === 'TELEGRAM_CV' && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                        <Send size={15} />
                      </div>
                    )}
                    {item.type === 'NEW_APPLICATION' && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                        <UserCheck size={16} />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-xs font-semibold truncate ${
                          isUnread ? 'text-slate-900' : 'text-slate-700'
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{item.subtitle}</p>
                  </div>

                  {isUnread && (
                    <span className="h-2 w-2 rounded-full bg-emerald-600 mt-2 shrink-0" />
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-slate-100 p-2.5 bg-slate-50/40 text-center">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/pipeline');
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1a5d4c] hover:underline"
          >
            Barcha nomzodlarni ko'rish
            <ArrowRight size={13} />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
