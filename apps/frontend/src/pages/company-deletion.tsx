import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useData,
} from '../components/ui';
import { send } from '../lib/api';

export function CompanyDeletionButton({
  company,
  onDeleted,
}: {
  company: {
    id: number;
    name: string;
    _count: { users: number; vacancies: number; applications: number };
  };
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setBusy(true);
    setError('');
    try {
      const result = await send<{ deleted: boolean; pendingFiles: number | null }>(
        `/platform-admin/companies/${company.id}`,
        { confirmationName: company.name },
        'DELETE',
      );
      setOpen(false);
      if (result.pendingFiles === 0)
        toast.success(t('companyDeletion.deletedSuccess'));
      else
        toast.warning(t('companyDeletion.deletedPendingFiles'));
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-red-700 border-red-200 hover:bg-red-50"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        <Trash2 size={14} className="mr-1.5" /> {t('companyDeletion.deleteButton')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('companyDeletion.modalTitle')}</DialogTitle>
            <DialogDescription>{company.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert message={error} />
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-semibold">{t('companyDeletion.irreversible')}</p>
              <p className="mt-2">
                {t('companyDeletion.impact', {
                  users: company._count.users,
                  vacancies: company._count.vacancies,
                  applications: company._count.applications,
                })}
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={remove}
              >
                {busy ? t('companyDeletion.deleting') : t('companyDeletion.confirmDelete')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PendingCompanyFiles() {
  const { t } = useTranslation();
  const { data, error, reload } = useData<
    Array<{ companyId: number; companyName: string; pendingFiles: number }>
  >('/platform-admin/file-cleanups');
  const [busy, setBusy] = useState<number | null>(null);
  async function retry(id: number) {
    setBusy(id);
    try {
      const result = await send<{ pendingFiles: number }>(
        `/platform-admin/file-cleanups/${id}/retry`,
        {},
      );
      if (result.pendingFiles === 0) toast.success(t('companyDeletion.cleanupSuccess'));
      else
        toast.warning(
          t('companyDeletion.filesRemaining', { count: result.pendingFiles }),
        );
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  if (error) return <Alert message={`${t('common.error')}: ${error}`} />;
  if (!data?.length) return null;
  return (
    <section className="panel padded border-amber-200">
      <h2>{t('companyDeletion.pendingCleanupsTitle')}</h2>
      <p className="text-sm text-slate-500 mt-2 mb-4">
        {t('companyDeletion.pendingCleanupsDesc')}
      </p>
      <div className="space-y-3">
        {data.map((item) => (
          <div
            key={item.companyId}
            className="flex flex-wrap justify-between items-center gap-3 rounded-xl border border-slate-200 p-3"
          >
            <div>
              <strong className="text-sm">{item.companyName}</strong>
              <p className="text-xs text-slate-500">
                #{item.companyId} · {item.pendingFiles} {t('common.records')}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => retry(item.companyId)}
            >
              {busy === item.companyId ? t('companyDeletion.cleaning') : t('companyDeletion.retryCleanup')}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
