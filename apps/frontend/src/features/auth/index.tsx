import { createContext, useContext, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Check, Eye, EyeOff, Layers3, ShieldCheck } from 'lucide-react';
import type { User } from '../../types';
import { ApiError, send } from '../../lib/api';
import { Alert, Button, Input } from '../../components/ui';

export const AuthContext = createContext<{ user: User; refresh: () => Promise<void> }>(
  {} as { user: User; refresh: () => Promise<void> },
);
export const useAuth = () => useContext(AuthContext);

export function AuthPage({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const token = new URLSearchParams(window.location.search).get('invite');
  const [mode, setMode] = useState<'login' | 'register'>(token ? 'register' : 'login');
  const [contactMethod, setContactMethod] = useState<'email' | 'phone'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    const data = Object.fromEntries(f.entries());
    try {
      const res = await send<{ mfaRequired?: boolean; challengeToken?: string }>(
        token ? '/auth/accept-invitation' : `/auth/${mode}`,
        token ? { ...data, token } : data,
      );

      if (res?.mfaRequired && res?.challengeToken) {
        setMfaChallenge(res.challengeToken);
        setMfaCode('');
        return;
      }

      if (token) window.history.replaceState({}, '', '/');
      await onSuccess();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401 && mode === 'login' && !token
          ? 'Email/telefon yoki parol noto‘g‘ri. Ro‘yxatdan o‘tishda yaratgan parolingizni kiriting.'
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!mfaChallenge || !mfaCode.trim()) return;
    setBusy(true);
    setError('');
    try {
      await send('/auth/mfa/verify', {
        challengeToken: mfaChallenge,
        code: mfaCode.trim(),
      });
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
        {mfaChallenge ? (
          <form onSubmit={submitMfa} className="auth-card">
            <span className="eyebrow">XAVFSIZLIK TASDIQLASH</span>
            <h2>Ikki bosqichli autentifikatsiya (2FA)</h2>
            <p>
              Hisobingizga kirish uchun Authenticator ilovangizdagi 6 xonali kodni yoki zaxira kodini kiriting.
            </p>
            <Alert message={error} />
            <label>
              Tasdiqlash kodi
              <Input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                autoFocus
                required
                maxLength={16}
                placeholder="123456 yoki XXXX-XXXX"
                className="mt-1.5 font-mono text-center tracking-widest text-lg h-12"
              />
            </label>
            <Button
              type="submit"
              className="w-full mt-2 h-11 text-base font-semibold bg-[#245e4f] hover:bg-[#1b4338] text-white flex items-center justify-center gap-2"
              disabled={busy || !mfaCode.trim()}
            >
              {busy ? 'Tekshirilmoqda…' : 'Hisobga kirish'}
              <ArrowRight size={17} />
            </Button>
            <button
              type="button"
              className="text-button text-xs text-slate-500 hover:text-slate-700 mt-2 text-center w-full"
              onClick={() => {
                setMfaChallenge(null);
                setError('');
              }}
            >
              ← Boshqa hisob bilan kirish
            </button>
          </form>
        ) : (
          <form name={`auth-${mode}-${contactMethod}`} onSubmit={submit} className="auth-card">
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
            <>
              <div className="flex gap-2" role="group" aria-label="Kirish usuli">
                {(['email', 'phone'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => { setContactMethod(method); setError(''); }}
                    aria-pressed={contactMethod === method}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${contactMethod === method ? 'border-[#245e4f] bg-[#e8f3ef] text-[#245e4f]' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}
                  >
                    {method === 'email' ? 'Email' : 'Telefon raqam'}
                  </button>
                ))}
              </div>
              <label>
                {contactMethod === 'email' ? 'Work email' : 'Telefon raqam'}
                {contactMethod === 'email' ? (
                  <Input
                    key="email"
                    id="auth-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="section-email email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    placeholder="you@company.com"
                    className="mt-1.5"
                  />
                ) : (
                  <Input key="phone" id="auth-phone" name="phone" type="tel" inputMode="tel" required autoComplete="section-phone tel" placeholder="+998 90 123 45 67" className="mt-1.5" />
                )}
              </label>
            </>
          )}
          <label>
            Password
            <div className="relative mt-1.5 flex items-center">
              <Input
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={mode === 'register' ? 8 : 1}
                maxLength={72}
                autoComplete={`section-${contactMethod} ${mode === 'register' ? 'new-password' : 'current-password'}`}
                placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'}
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3.5 p-1 text-[#94a3b8] hover:text-[#0f172a] focus:outline-none transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
        )}
      </main>
    </div>
  );
}
