import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, send } from '../../lib/api';
import { Button, Card, Input } from '../../components/ui';

/** HR settings for the candidate bot: the share link and automatic channel posting. */
export function CandidateIntakePanel() {
  const { t } = useTranslation();
  const [link, setLink] = useState<string>('');
  const [linkError, setLinkError] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ url: string; autoPublish?: boolean }>('/v1/integrations/telegram/candidate-link')
      .then((result) => {
        setLink(result.url);
        setAutoPublish(Boolean(result.autoPublish));
      })
      .catch(() => setLinkError(true));
  }, []);

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
    </Card>
  );
}
