import { createContext, useContext, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Layers3,
  ShieldCheck,
  Mail,
  LockKeyhole,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { User } from '../../types';
import { ApiError, send } from '../../lib/api';
import { Alert, Button, Input, LanguageSwitcher } from '../../components/ui';
import { GoogleSignInButton } from './google-sign-in';
import './auth.css';
import './auth.dark.css';

export const AuthContext = createContext<{ user: User; refresh: () => Promise<void> }>(
  {} as { user: User; refresh: () => Promise<void> },
);
export const useAuth = () => useContext(AuthContext);

export function AuthPage({
  onSuccess,
  initialMode,
  onModeChange,
}: {
  onSuccess: () => Promise<void>;
  initialMode?: 'login' | 'register';
  onModeChange?: (mode: 'login' | 'register') => void;
}) {
  const { t } = useTranslation();
  const token = new URLSearchParams(window.location.search).get('invite');
  const [mode, setMode] = useState<'login' | 'register'>(
    token ? 'register' : (initialMode ?? 'login'),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [googleSignup, setGoogleSignup] = useState<{
    signupToken: string;
    email: string;
    fullName: string;
  } | null>(null);
  const [googleCompanyName, setGoogleCompanyName] = useState('');
  const [googleAttempt, setGoogleAttempt] = useState(0);

  async function googleSignIn(credential: string) {
    setBusy(true);
    setError('');
    try {
      const result = await send<{
        googleRegistrationRequired?: boolean;
        signupToken?: string;
        email?: string;
        fullName?: string;
      }>('/auth/google/verify', { credential });
      if (
        result.googleRegistrationRequired &&
        result.signupToken &&
        result.email &&
        result.fullName
      ) {
        const company = formRef.current?.elements.namedItem(
          'companyName',
        ) as HTMLInputElement | null;
        setGoogleCompanyName(company?.value || '');
        setGoogleSignup({
          signupToken: result.signupToken,
          email: result.email,
          fullName: result.fullName,
        });
        return;
      }
      await onSuccess();
    } catch (error) {
      setError((error as Error).message);
      setGoogleAttempt((attempt) => attempt + 1);
    } finally {
      setBusy(false);
    }
  }

  async function registerGoogle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!googleSignup) return;
    setBusy(true);
    setError('');
    const fields = new FormData(e.currentTarget);
    try {
      await send('/auth/google/register', {
        signupToken: googleSignup.signupToken,
        companyName: fields.get('companyName'),
        fullName: fields.get('fullName'),
      });
      await onSuccess();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

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

      await onSuccess();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401 && mode === 'login' && !token
          ? t('auth.invalidCredentials')
          : (e as Error).message,
      );
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
          <span className="eyebrow">{t('auth.eyebrow')}</span>
          <h1>
            {t('auth.heroTitle1')}
            <br />
            {t('auth.heroTitle2')}
          </h1>
          <p>{t('auth.heroSubtitle')}</p>
          <div className="auth-benefits">
            {[t('auth.benefit1'), t('auth.benefit2'), t('auth.benefit3')].map((text) => (
              <div key={text}>
                <Check size={17} />
                {text}
              </div>
            ))}
          </div>
        </div>
        <small>
          <ShieldCheck size={16} /> {t('auth.dataPrivacyNote')}
        </small>
      </aside>
      <main className="auth-main">
        <div className="absolute top-6 right-6 md:top-8 md:right-8 z-20">
          <LanguageSwitcher />
        </div>
        {googleSignup ? (
          <form onSubmit={registerGoogle} className="auth-card">
            <header className="auth-card-heading">
              <span className="eyebrow">{t('auth.newWorkspaceEyebrow', 'YANGI WORKSPACE')}</span>
              <h2>{t('auth.createCompanyTitle', 'Kompaniyangizni yarating')}</h2>
              <p>
                {t('auth.googleVerified', 'Google hisobingiz tasdiqlandi:')} <strong>{googleSignup.email}</strong>.{' '}
                {t('auth.finishSignup', 'Ro‘yxatdan o‘tishni yakunlang.')}
              </p>
            </header>
            <Alert message={error} />
            <label>
              {t('auth.companyName')}
              <Input
                name="companyName"
                required
                maxLength={160}
                autoComplete="organization"
                defaultValue={googleCompanyName}
                className="mt-1.5"
              />
            </label>
            <label>
              {t('auth.fullName')}
              <Input
                name="fullName"
                required
                maxLength={160}
                autoComplete="name"
                defaultValue={googleSignup.fullName}
                className="mt-1.5"
              />
            </label>
            <Button type="submit" disabled={busy} className="auth-submit w-full">
              {busy ? t('auth.creating', 'Yaratilmoqda…') : t('auth.createWorkspace', 'Workspace yaratish')}
            </Button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setGoogleSignup(null);
                setError('');
              }}
            >
              {t('auth.otherMethod', '← Boshqa usul bilan kirish')}
            </button>
          </form>
        ) : (
          <form ref={formRef} name={`auth-${mode}`} onSubmit={submit} className="auth-card">
            <header className="auth-card-heading">
              <span className="eyebrow">{t('auth.workspaceEyebrow')}</span>
              <h2>
                {token
                  ? t('auth.joinTeam')
                  : mode === 'login'
                    ? t('auth.welcomeBack')
                    : t('auth.makeRoom')}
              </h2>
              <p>
                {token
                  ? t('auth.inviteSubtitle')
                  : mode === 'login'
                    ? t('auth.signInSubtitle')
                    : t('auth.registerSubtitle')}
              </p>
            </header>
            <Alert message={error} />
            {!token && (
              <GoogleSignInButton
                key={googleAttempt}
                disabled={busy}
                onCredential={(credential) => void googleSignIn(credential)}
                onError={setError}
              />
            )}
            {mode === 'register' && (
              <>
                {!token && (
                  <label>
                    {t('auth.companyName')}
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
                  {t('auth.fullName')}
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
                {t('auth.workEmail')}
                <div className="auth-input-wrap">
                  <Mail size={18} className="auth-input-icon" aria-hidden="true" />
                  <Input
                    id="auth-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    placeholder="you@company.com"
                    className="auth-email-input"
                  />
                </div>
              </label>
            )}
            <label>
              {t('auth.password')}
              <div className="auth-input-wrap">
                <LockKeyhole size={18} className="auth-input-icon" aria-hidden="true" />
                <Input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={mode === 'register' ? 8 : 1}
                  maxLength={72}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  placeholder={
                    mode === 'register'
                      ? t('auth.passwordPlaceholderRegister')
                      : t('auth.passwordPlaceholderLogin')
                  }
                  className="auth-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="auth-password-toggle"
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  title={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <Button
              type="submit"
              className="auth-submit w-full flex items-center justify-center gap-2"
              disabled={busy}
            >
              {busy
                ? t('common.pleaseWait')
                : token
                  ? t('auth.joinWorkspace')
                  : mode === 'login'
                    ? t('auth.signIn')
                    : t('auth.createWorkspace')}
              <ArrowRight size={17} />
            </Button>
            {!token && (
              <div className="auth-switch">
                {mode === 'login' ? t('auth.newToShortlist') : t('auth.alreadyHaveAccount')}{' '}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    const nextMode = mode === 'login' ? 'register' : 'login';
                    setMode(nextMode);
                    onModeChange?.(nextMode);
                    setError('');
                  }}
                >
                  {mode === 'login' ? t('auth.createAWorkspace') : t('auth.signIn')}
                </button>
              </div>
            )}
            <small className="auth-note">{t('auth.inviteNote')}</small>
          </form>
        )}
      </main>
    </div>
  );
}
