import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BriefcaseBusiness, Plus, Search, Pencil, Trash2, Users } from 'lucide-react';
import { api, send } from './api';
import { Alert, Badge, Empty, Loading, Modal, PageTitle, Pagination, useData } from './ui';
import type { Page, Vacancy, Requirement } from './types';
import { useAuth } from './auth';
import { VacancyGenerator } from './vacancy-generator';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
export function VacancyForm({
  value,
  close,
  saved,
}: {
  value: Vacancy | null;
  close: () => void;
  saved: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(value?.title ?? '');
  const [description, setDescription] = useState(value?.description ?? '');
  const [status, setStatus] = useState(value?.status ?? 'ACTIVE');
  const [requirements, setRequirements] = useState<Requirement[]>(
    value?.requirements || [{ name: '', description: '', required: true }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      await send(
        `/vacancies${value ? `/${value.id}` : ''}`,
        {
          ...Object.fromEntries(f),
          status,
          requirements: requirements.map(({ name, description, required }) => ({
            name,
            description,
            required,
          })),
        },
        value ? 'PUT' : 'POST',
      );
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={value ? 'Edit vacancy' : 'Create a vacancy'} close={close}>
      <form onSubmit={submit}>
        <Alert message={error} />
        <VacancyGenerator
          configured={user.aiConfigured}
          disabled={busy}
          apply={(draft) => {
            setTitle(draft.title);
            setDescription(draft.description);
            setRequirements(draft.requirements);
          }}
        />
        <label>
          Job title
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="e.g. Senior backend engineer"
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={15000}
            rows={4}
            placeholder="The role, responsibilities, and what your team is building…"
          />
        </label>
        <label>
          Status
          <Select value={status} onValueChange={setStatus} disabled={busy}>
            <SelectTrigger aria-label="Status" className="mt-1 w-full">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                <SelectItem value="DRAFT">DRAFT</SelectItem>
                <SelectItem value="CLOSED">CLOSED</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        <div className="form-heading">
          <h3>Requirements</h3>
          <span>{requirements.length}/40</span>
        </div>
        <p className="muted small">
          Use specific, job-related requirements that can be supported by CV evidence.
        </p>
        {requirements.map((r, i) => (
          <div className="requirement-editor" key={i}>
            <div className="row">
              <input
                aria-label={`Requirement ${i + 1}`}
                required
                maxLength={200}
                value={r.name}
                placeholder="e.g. Experience building REST APIs"
                onChange={(e) =>
                  setRequirements((v) =>
                    v.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  )
                }
              />
              <button
                type="button"
                className="icon-button danger"
                aria-label={`Remove requirement ${i + 1}`}
                onClick={() => setRequirements((v) => v.filter((_, j) => j !== i))}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <input
              aria-label={`Requirement ${i + 1} details`}
              maxLength={2000}
              value={r.description || ''}
              placeholder="Additional detail (optional)"
              onChange={(e) =>
                setRequirements((v) =>
                  v.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                )
              }
            />
            <label className="check">
              <input
                type="checkbox"
                checked={r.required}
                onChange={(e) =>
                  setRequirements((v) =>
                    v.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)),
                  )
                }
              />{' '}
              Required
            </label>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={requirements.length >= 40}
          onClick={() =>
            setRequirements((v) => [...v, { name: '', description: '', required: true }])
          }
        >
          <Plus size={15} /> Add requirement
        </button>
        {value && (
          <p className="muted small">
            Saving clears previous AI evidence and interview questions for this vacancy.
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save vacancy'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function Vacancies() {
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Vacancy | null>(null);
  const [open, setOpen] = useState(params.has('new'));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState('');
  const { data, error, reload } = useData<Page<Vacancy>>(
    `/vacancies?page=${page}&search=${encodeURIComponent(search)}`,
  );
  const close = () => {
    setOpen(false);
    setEditing(null);
    setParams({});
  };
  async function remove(v: Vacancy) {
    if (!window.confirm(`Delete “${v.title}” and its applications? This cannot be undone.`)) return;
    try {
      await api(`/vacancies/${v.id}`, { method: 'DELETE' });
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="BUILD YOUR TEAM"
        title="Vacancies"
        text="Define the opportunity. Make the requirements clear."
      >
        <button className="primary" onClick={() => setOpen(true)}>
          <Plus size={17} /> Create vacancy
        </button>
      </PageTitle>
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search vacancies"
            placeholder="Search vacancies…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <span>{data?.total ?? '—'} vacancies</span>
      </div>
      <Alert message={error || actionError} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            {data.items.length ? (
              <div className="vacancy-grid">
                {data.items.map((v) => (
                  <article className="vacancy-card" key={v.id}>
                    <div className="row between">
                      <span className="role-icon">
                        <BriefcaseBusiness size={21} />
                      </span>
                      <Badge value={v.status} />
                    </div>
                    <h2>{v.title}</h2>
                    <p className="clamp">{v.description}</p>
                    <div className="requirement-tags">
                      {v.requirements.slice(0, 3).map((r, i) => (
                        <span key={i}>{r.name}</span>
                      ))}
                      {v.requirements.length > 3 && <span>+{v.requirements.length - 3}</span>}
                    </div>
                    <footer>
                      <span>
                        <Users size={15} />
                        {v._count?.applications || 0} applicants
                      </span>
                      <div className="row">
                        <button
                          className="icon-button"
                          aria-label={`Edit ${v.title}`}
                          onClick={() => {
                            setEditing(v);
                            setOpen(true);
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button danger"
                          aria-label={`Delete ${v.title}`}
                          onClick={() => void remove(v)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </footer>
                  </article>
                ))}
              </div>
            ) : (
              <section className="panel">
                <Empty
                  title={search ? 'No matching vacancies' : 'Make your first opportunity'}
                  text={
                    search
                      ? 'Try a different search.'
                      : 'Add a role and the evidence you want to explore with candidates.'
                  }
                />
              </section>
            )}
            <Pagination page={page} total={data.total} setPage={setPage} />
          </>
        )
      )}
      {open && (
        <VacancyForm
          value={editing}
          close={close}
          saved={() => {
            close();
            reload();
          }}
        />
      )}
    </>
  );
}
