import { useState } from 'react';
import type { FormEvent } from 'react';
import { Copy, Link as LinkIcon, ShieldCheck, UserPlus } from 'lucide-react';
import { send } from './api';
import { Alert, Badge, Loading, PageTitle, useData } from './ui';
import type { User } from './types';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
export function Team() {
  const { data, error } = useData<User[]>('/auth/team');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState('HR');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInvite('');
    try {
      const result = await send<{ inviteUrl: string }>('/auth/invitations', {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        role,
      });
      setInvite(result.inviteUrl);
      setCopied(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="BETTER TOGETHER"
        title="Your team"
        text="Give your hiring team a shared place to work."
      />
      <Alert message={error || actionError} />
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Workspace members</h2>
            <ShieldCheck size={20} />
          </div>
          {!data && !error ? (
            <Loading />
          ) : (
            data && (
              <div className="team-list">
                {data.map((u) => (
                  <div className="team-member" key={u.id}>
                    <span className="avatar">{u.fullName.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <strong>{u.fullName}</strong>
                      <small>{u.email}</small>
                    </div>
                    <Badge value={u.role} />
                  </div>
                ))}
              </div>
            )
          )}
        </section>
        <section className="panel padded">
          <h2>
            <UserPlus size={20} /> Invite a teammate
          </h2>
          <p className="muted">
            Create a secure, single-use invitation. Share the link directly with your teammate.
          </p>
          <form onSubmit={submit}>
            <label>
              Work email
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                placeholder="teammate@company.com"
              />
            </label>
            <label>
              Role
              <Select value={role} onValueChange={setRole} disabled={busy}>
                <SelectTrigger aria-label="Role" className="mt-1 w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="HR">HR</SelectItem>
                    <SelectItem value="RECRUITER">Recruiter</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <button className="primary" disabled={busy}>
              <LinkIcon size={16} />
              {busy ? 'Creating…' : 'Create invitation link'}
            </button>
          </form>
          {invite && (
            <div className="invite-result">
              <strong>Invitation ready · expires in 24 hours</strong>
              <input aria-label="Invitation link" readOnly value={invite} />
              <button
                className="secondary"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(invite)
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError('Clipboard unavailable. Select and copy the link above.'),
                    );
                }}
              >
                <Copy size={15} />
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <small>
                This link grants access to your company. Only share it with its intended recipient.
              </small>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
