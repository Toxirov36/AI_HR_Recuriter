import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy, Pencil, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, send } from '../../lib/api';
import { Button, Card, Input } from '../../components/ui';
import type { VacancyField } from '../../types';

/** HR settings for the candidate bot: the share link and the hiring fields candidates pick from. */
export function CandidateIntakePanel() {
  const { t } = useTranslation();
  const [fields, setFields] = useState<VacancyField[]>([]);
  const [link, setLink] = useState<string>('');
  const [linkError, setLinkError] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setFields(await api<VacancyField[]>('/vacancy-fields'));
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    api<{ url: string; autoPublish?: boolean }>('/v1/integrations/telegram/candidate-link')
      .then((result) => {
        setLink(result.url);
        setAutoPublish(Boolean(result.autoPublish));
      })
      .catch(() => setLinkError(true));
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addField(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    void run(async () => {
      await send('/vacancy-fields', { name: value, sortOrder: fields.length });
      setName('');
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('admin.candidateLinkCopied'));
    } catch {
      toast.error(t('admin.candidateLinkCopyFailed'));
    }
  }

  return (
    <Card className="p-6 border border-slate-200 bg-white shadow-sm space-y-5">
      <div className="space-y-1">
        <h3 className="text-base font-bold text-slate-900">{t('admin.candidateIntakeTitle')}</h3>
        <p className="text-sm text-slate-600">{t('admin.candidateIntakeDescription')}</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="candidate-bot-link">
          {t('admin.candidateLinkLabel')}
        </label>
        <div className="flex gap-2">
          <Input id="candidate-bot-link" readOnly value={link || (linkError ? t('admin.candidateLinkUnavailable') : '')} />
          <Button type="button" variant="outline" disabled={!link} onClick={copyLink} aria-label={t('admin.candidateLinkCopy')}>
            <Copy size={16} />
          </Button>
        </div>
        <p className="text-xs text-slate-500">{t('admin.candidateLinkHint')}</p>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={autoPublish}
          disabled={busy}
          onChange={(event) => {
            const enabled = event.target.checked;
            setBusy(true);
            send('/v1/integrations/telegram/auto-publish', { enabled }, 'PUT')
              .then(() => setAutoPublish(enabled))
              .catch((error: Error) => toast.error(error.message))
              .finally(() => setBusy(false));
          }}
        />
        <span>
          <strong className="block text-slate-900">{t('admin.autoPublishLabel')}</strong>
          <span className="text-xs text-slate-500">{t('admin.autoPublishHint')}</span>
        </span>
      </label>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">{t('admin.fieldsTitle')}</h4>
        <p className="text-xs text-slate-500">{t('admin.fieldsHint')}</p>
        <ul className="space-y-2">
          {fields.map((field) => (
            <li key={field.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
              {editing?.id === field.id ? (
                <>
                  <Input
                    aria-label={t('admin.fieldName')}
                    value={editing.name}
                    maxLength={40}
                    onChange={(event) => setEditing({ id: field.id, name: event.target.value })}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !editing.name.trim()}
                    aria-label={t('admin.fieldSave')}
                    onClick={() =>
                      run(async () => {
                        await send(`/vacancy-fields/${field.id}`, { name: editing.name.trim(), sortOrder: field.sortOrder, isActive: field.isActive }, 'PUT');
                        setEditing(null);
                      })
                    }
                  >
                    <Check size={16} />
                  </Button>
                  <Button type="button" size="sm" variant="outline" aria-label={t('admin.fieldCancel')} onClick={() => setEditing(null)}>
                    <X size={16} />
                  </Button>
                </>
              ) : (
                <>
                  <span className={`flex-1 text-sm ${field.isActive ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{field.name}</span>
                  <span className="text-xs text-slate-500">{t('admin.fieldVacancies', { count: field._count?.vacancies ?? 0 })}</span>
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={field.isActive}
                      disabled={busy}
                      onChange={(event) =>
                        run(() => send(`/vacancy-fields/${field.id}`, { name: field.name, sortOrder: field.sortOrder, isActive: event.target.checked }, 'PUT'))
                      }
                    />
                    {t('admin.fieldActive')}
                  </label>
                  <Button type="button" size="sm" variant="outline" aria-label={t('admin.fieldEdit')} onClick={() => setEditing({ id: field.id, name: field.name })}>
                    <Pencil size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    aria-label={t('admin.fieldDelete')}
                    onClick={() => {
                      if (window.confirm(t('admin.fieldDeleteConfirm', { name: field.name }))) void run(() => send(`/vacancy-fields/${field.id}`, undefined, 'DELETE'));
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
            </li>
          ))}
          {!fields.length && <li className="text-sm text-slate-500">{t('admin.fieldsEmpty')}</li>}
        </ul>
        <form className="flex gap-2" onSubmit={addField}>
          <Input
            aria-label={t('admin.fieldName')}
            placeholder={t('admin.fieldPlaceholder')}
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={busy || !name.trim()}>
            {t('admin.fieldAdd')}
          </Button>
        </form>
      </div>
    </Card>
  );
}
