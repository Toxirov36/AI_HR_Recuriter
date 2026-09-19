import { useState } from 'react';
import type { FormEvent } from 'react';
import { Copy, Link as LinkIcon, MessageCircle, ShieldCheck, UserPlus } from 'lucide-react';
import { send } from '../../lib/api';
import {
  Alert,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Input,
  Loading,
  PageTitle,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useData,
} from '../../components/ui';
import { toast } from 'sonner';
import type { User } from '../../types';

export function Team() {
  const { data, error } = useData<User[]>('/auth/team');
  const {
    data: telegramConnections,
    error: telegramError,
    reload: reloadTelegram,
  } = useData<
    Array<{
      id: string;
      enabled: boolean;
      canReply: boolean;
      canReadMessages: boolean;
      updatedAt: string;
    }>
  >('/v1/integrations/telegram/connections');
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
      toast.success('Invitation link created!');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function claimTelegram(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = e.currentTarget;
    const connectionId = String(new FormData(form).get('connectionId') || '').trim();
    try {
      await send(
        `/v1/integrations/telegram/connections/${encodeURIComponent(connectionId)}/claim`,
        {},
      );
      form.reset();
      reloadTelegram();
      toast.success('Telegram Business connection linked');
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
      <Alert message={error || telegramError || actionError} />
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
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-[#1b4338] text-white font-semibold text-xs">
                        {u.fullName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
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
              <Input
                name="email"
                type="email"
                required
                maxLength={254}
                placeholder="teammate@company.com"
                className="mt-1"
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
            <Button
              type="submit"
              className="bg-[#245e4f] hover:bg-[#1b4338] text-white flex items-center gap-2 mt-2"
              disabled={busy}
            >
              <LinkIcon size={16} />
              {busy ? 'Creating…' : 'Create invitation link'}
            </Button>
          </form>
          {invite && (
            <div className="invite-result">
              <strong>Invitation ready · expires in 24 hours</strong>
              <Input
                aria-label="Invitation link"
                readOnly
                value={invite}
                className="mt-1 font-mono text-xs"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-2 flex items-center gap-1.5"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(invite)
                          .then(() => {
                            setCopied(true);
                            toast.success('Invitation link copied to clipboard!');
                          })
                          .catch(() =>
                            setError('Clipboard unavailable. Select and copy the link above.'),
                          );
                      }}
                    >
                      <Copy size={15} />
                      {copied ? 'Copied' : 'Copy link'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{copied ? 'Copied to clipboard' : 'Click to copy invitation link'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <small>
                This link grants access to your company. Only share it with its intended recipient.
              </small>
            </div>
          )}
        </section>
      </div>
      <section className="panel padded mt-4">
        <div className="panel-heading flush">
          <div>
            <h2>
              <MessageCircle size={20} /> Telegram Business
            </h2>
            <p>Link a connection received from your Telegram Business bot.</p>
          </div>
        </div>
        <form onSubmit={claimTelegram} className="row wrap items-end">
          <label className="flex-1 min-w-[240px]">
            Business connection ID
            <Input
              name="connectionId"
              required
              maxLength={200}
              autoComplete="off"
              placeholder="Paste the connection ID from the backend log"
              className="mt-1"
            />
          </label>
          <Button type="submit" disabled={busy} className="bg-[#245e4f] text-white">
            Link Telegram
          </Button>
        </form>
        {telegramConnections?.length ? (
          <div className="team-list mt-4">
            {telegramConnections.map((connection) => (
              <div className="team-member" key={connection.id}>
                <MessageCircle size={18} />
                <div>
                  <strong>{connection.enabled ? 'Connected' : 'Disabled'}</strong>
                  <small>{connection.id}</small>
                </div>
                <span className="muted small">
                  {connection.canReadMessages ? 'Can mark as read' : 'Cannot mark as read'} ·{' '}
                  {connection.canReply ? 'Can reply' : 'No reply access'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted mt-3">No Telegram Business connection linked yet.</p>
        )}
      </section>
    </>
  );
}
