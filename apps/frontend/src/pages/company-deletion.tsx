import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
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
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await send<{ deleted: boolean; pendingFiles: number | null }>(
        `/platform-admin/companies/${company.id}`,
        { confirmationName: name, reason: reason.trim() },
        'DELETE',
      );
      setOpen(false);
      if (result.pendingFiles === 0)
        toast.success('Kompaniya va bog‘langan ma’lumotlar o‘chirildi');
      else
        toast.warning(
          'Kompaniya o‘chirildi. CV fayllarini tozalash kutilmoqda — quyidagi bo‘limni tekshiring.',
        );
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
          setName('');
          setReason('');
          setError('');
          setOpen(true);
        }}
      >
        <Trash2 size={14} className="mr-1.5" /> O‘chirish
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kompaniyani butunlay o‘chirish</DialogTitle>
            <DialogDescription>{company.name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={remove} className="space-y-4">
            <Alert message={error} />
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-semibold">Bu amalni qaytarib bo‘lmaydi.</p>
              <p className="mt-2">
                {company._count.users} xodim, {company._count.vacancies} vakansiya,{' '}
                {company._count.applications} ariza, barcha nomzodlar, CVlar va kompaniya tarixi
                o‘chiriladi. Platforma amallari tarixi saqlanadi.
              </p>
            </div>
            <label className="block text-sm font-medium">
              Kompaniya nomini tasdiqlang
              <Input
                className="mt-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={160}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <p className="text-xs text-slate-500 break-words">
              Aynan kiriting: <strong>{company.name}</strong>
            </p>
            <label className="block text-sm font-medium">
              O‘chirish sababi
              <Textarea
                className="mt-2"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={5}
                maxLength={300}
              />
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Bekor qilish
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={busy || name !== company.name || reason.trim().length < 5}
              >
                {busy ? 'O‘chirilmoqda…' : 'Butunlay o‘chirish'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PendingCompanyFiles() {
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
      if (result.pendingFiles === 0) toast.success('CV fayllari tozalandi');
      else
        toast.warning(
          `${result.pendingFiles} ta fayl qoldi. Qayta urinib ko‘ring; davom etsa R2 ulanishini tekshiring.`,
        );
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  if (error) return <Alert message={`CV tozalash holatini yuklab bo‘lmadi: ${error}`} />;
  if (!data?.length) return null;
  return (
    <section className="panel padded border-amber-200">
      <h2>Tozalanishi kutilayotgan CV fayllari</h2>
      <p className="text-sm text-slate-500 mt-2 mb-4">
        Kompaniyalar bazadan o‘chirilgan. Qolgan fayllarni R2’dan tozalashni davom ettiring; har
        urinishda 10 tagacha fayl tozalanadi.
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
                #{item.companyId} · {item.pendingFiles} ta fayl
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => retry(item.companyId)}
            >
              {busy === item.companyId ? 'Tozalanmoqda…' : 'Tozalashni davom ettirish'}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
