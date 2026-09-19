import { createContext, useContext, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Check, Layers3, ShieldCheck } from 'lucide-react';
import type { User } from '../../types';
import { send } from '../../lib/api';
import { Alert, Button, Input } from '../../components/ui';

export const AuthContext = createContext<{ user: User; refresh: () => Promise<void> }>(
  {} as { user: User; refresh: () => Promise<void> },
);
export const useAuth = () => useContext(AuthContext);

export function AuthPage({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const token = new URLSearchParams(window.location.search).get('invite');
  const [mode, setMode] = useState<'login' | 'register'>(token ? 'register' : 'login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const data = Object.fromEntries(f.entries());
    try {
      await send(
        token ? '/auth/accept-invitation' : `/auth/${mode}`,
        token ? { ...data, token } : data,
      );
      if (token) window.history.replaceState({}, '', '/');
      await onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <div className="brand">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          shortlist<span className="brand-dot">.</span>
        </div>
        <div>
          <span className="eyebrow">THOUGHTFUL HIRING STARTS HERE</span>
          <h1>
            People first.
            <br />
            Evidence always.
          </h1>
          <p>A calmer, clearer way to bring the right conversations to your hiring process.</p>
          <div className="auth-benefits">
            {[
              'One workspace for your hiring team',
              'CV evidence you can actually verify',
              'AI assistance. Human decisions.',
            ].map((t) => (
              <div key={t}>
                <Check size={17} />
                {t}
              </div>
            ))}
          </div>
        </div>
        <small>
          <ShieldCheck size={16} /> Your company's candidates stay in your company's workspace.
        </small>
      </aside>
      <main className="auth-main">
        <form onSubmit={submit} className="auth-card">
          <span className="eyebrow">YOUR RECRUITING WORKSPACE</span>
          <h2>
            {token
              ? 'Join your team'
              : mode === 'login'
                ? 'Welcome back.'
                : 'Make room for great people.'}
          </h2>
          <p>
            {token
              ? 'Your invitation connects you to your company.'
              : mode === 'login'
                ? 'Sign in to pick up where you left off.'
                : 'Create your company and administrator account.'}
          </p>
          <Alert message={error} />
          {mode === 'register' && (
            <>
              {!token && (
                <label>
                  Company name
                  <Input
                    name="companyName"
                    required
                    maxLength={160}
                    autoComplete="organization"
                    placeholder="Acme Studio"
                    className="mt-1.5"
                  />
                </label>
              )}
              <label>
                Full name
                <Input
                  name="fullName"
                  required
                  maxLength={160}
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  className="mt-1.5"
                />
              </label>
            </>
          )}
          {!token && (
            <label>
              Work email
              <Input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                className="mt-1.5"
              />
            </label>
          )}
          <label>
            Password
            <Input
              name="password"
              type="password"
              required
              minLength={mode === 'register' ? 12 : 1}
              maxLength={72}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder={mode === 'register' ? 'At least 12 characters' : 'Enter your password'}
              className="mt-1.5"
            />
          </label>
          <Button
            type="submit"
            className="w-full mt-2 h-11 text-base font-semibold bg-[#245e4f] hover:bg-[#1b4338] text-white flex items-center justify-center gap-2"
            disabled={busy}
          >
            {busy
              ? 'Please wait…'
              : token
                ? 'Join workspace'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create workspace'}
            <ArrowRight size={17} />
          </Button>
          {!token && (
            <div className="auth-switch">
              {mode === 'login' ? 'New to Shortlist?' : 'Already have an account?'}{' '}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setError('');
                }}
              >
                {mode === 'login' ? 'Create a workspace' : 'Sign in'}
              </button>
            </div>
          )}
          <small className="auth-note">
            Joining an existing company? Ask your administrator for an invitation link.
          </small>
        </form>
      </main>
    </div>
  );
}
