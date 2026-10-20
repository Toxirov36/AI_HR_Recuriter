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
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
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

function timeAgo(dateString: string, t: (k: string, opts?: any) => string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return t('notifications.justNow');
  if (diffMins < 60) return t('notifications.minsAgo', { mins: diffMins });
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t('notifications.hoursAgo', { hours: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return t('notifications.yesterday');
  if (diffDays < 7) return t('notifications.daysAgo', { days: diffDays });
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationCenter() {
  const { t } = useTranslation();
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

  const [deletedIds, setDeletedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('shortlist_deleted_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const notifications = useMemo(() => {
    const items = data?.items || [];
    return items.filter((n) => !deletedIds.includes(n.id));
  }, [data?.items, deletedIds]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !readIds.includes(n.id)).length;
  }, [notifications, readIds]);

  const markAllAsRead = () => {
    const allIds = notifications.map((n) => n.id);
    const updated = Array.from(new Set([...readIds, ...allIds]));
    setReadIds(updated);
    try {
      localStorage.setItem('shortlist_read_notifications', JSON.stringify(updated));
    } catch {}
  };

  const clearAll = () => {
    const allItemIds = (data?.items || []).map((n) => n.id);
    const updated = Array.from(new Set([...deletedIds, ...allItemIds]));
    setDeletedIds(updated);
    try {
      localStorage.setItem('shortlist_deleted_notifications', JSON.stringify(updated));
    } catch {}
    toast.success(t('notifications.allCleared'));
  };

  const handleDeleteItem = (id: string) => {
    const updated = Array.from(new Set([...deletedIds, id]));
    setDeletedIds(updated);
    try {
      localStorage.setItem('shortlist_deleted_notifications', JSON.stringify(updated));
    } catch {}
    toast.success(t('notifications.itemDeleted'));
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
          aria-label={t('notifications.title')}
          title={t('notifications.title')}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white"
              aria-label={t('notifications.unreadAria', { count: unreadCount })}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[370px] sm:w-[420px] p-0 shadow-2xl border border-slate-200/80 rounded-2xl bg-white overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-900">{t('notifications.title')}</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                {t('notifications.unreadBadge', { count: unreadCount })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-[#1a5d4c] dark:hover:text-[#58c0a0] transition-colors"
                title={t('notifications.markAllAsRead')}
              >
                <CheckCheck size={14} />
                <span className="hidden sm:inline">{t('notifications.markAllAsRead')}</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
                title={t('notifications.clearAll')}
              >
                <Trash2 size={13} />
                <span>{t('notifications.clearAll')}</span>
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100/80">
          {data === undefined && !notifications.length ? (
            <div className="p-6 text-center text-xs text-slate-400">{t('notifications.loading')}</div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <Inbox size={22} />
              </div>
              <p className="text-sm font-medium text-slate-700">{t('notifications.emptyTitle')}</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
                {t('notifications.emptyDesc')}
              </p>
            </div>
          ) : (
            notifications.map((item) => {
              const isUnread = !readIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`group relative flex items-start gap-3 p-3.5 cursor-pointer transition-colors hover:bg-slate-50 ${
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

                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-xs font-semibold truncate ${
                          isUnread ? 'text-slate-900' : 'text-slate-700'
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {timeAgo(item.createdAt, t)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{item.subtitle}</p>
                  </div>

                  <div className="absolute right-2.5 top-3.5 flex items-center gap-1.5">
                    {isUnread && (
                      <span className="h-2 w-2 rounded-full bg-emerald-600 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteItem(item.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all shrink-0 cursor-pointer"
                      title={t('notifications.deleteNotification')}
                      aria-label={t('notifications.deleteNotification')}
                    >
                      <X size={14} />
                    </button>
                  </div>
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
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1a5d4c] dark:text-[#58c0a0] hover:underline cursor-pointer"
          >
            {t('notifications.viewAllCandidates')}
            <ArrowRight size={13} />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
