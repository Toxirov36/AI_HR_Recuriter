import { createContext, useContext, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { User } from '../../types';
import { ApiError, send } from '../../lib/api';
import { BrandMark } from '../../components/brand-mark';
import { Alert, LanguageSwitcher } from '../../components/ui';
import { GoogleSignInButton } from './google-sign-in';
import '@fontsource/onest/700.css';
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import './auth.css';

/** Sample candidates for the picture on the left; the first one is the person from the landing page chat. */
const SAMPLE = [
  { name: 'Aziz Karimov', match: 92 },
  { name: 'Malika Yusupova', match: 81 },
  { name: 'Jasur Tursunov', match: 67 },
];

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
    <div className="au-layout">
      <aside className="au-story">
        <a className="au-brand" href="/" aria-label="Shortlist">
          <BrandMark size={34} />
          <span>
            shortlist<span className="au-dot">.</span>
          </span>
        </a>
        <div className="au-pitch">
          <h2>{t('auth.heroTitle1')}</h2>
          <p>
            <strong>{t('auth.heroTitle2')}</strong> {t('auth.heroSubtitle')}
          </p>
          <div className="au-sample" role="img" aria-label={t('landing.dashLabel')}>
            <div className="au-sample-head">
              <strong>{t('landing.dashSort')}</strong>
              <span>{t('landing.dashSample')}</span>
            </div>
            <ol>
              {SAMPLE.map((person) => (
                <li key={person.name}>
                  <span className="au-avatar">{person.name[0]}</span>
                  <b>{person.name}</b>
                  <i style={{ ['--w' as string]: `${person.match}%` }} />
                  <em>{person.match}%</em>
                </li>
              ))}
            </ol>
          </div>
          <ul className="au-benefits">
            {[t('auth.benefit1'), t('auth.benefit2'), t('auth.benefit3')].map((text) => (
              <li key={text}>
                <Check size={17} aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="au-privacy">
          <ShieldCheck size={16} aria-hidden="true" /> {t('auth.dataPrivacyNote')}
        </p>
      </aside>
      <main className="au-main">
        <div className="au-lang">
          <LanguageSwitcher />
        </div>
        {googleSignup ? (
          <form onSubmit={registerGoogle} className="au-form">
            <header>
              <h1>{t('auth.createCompanyTitle', 'Kompaniyangizni yarating')}</h1>
              <p>
                {t('auth.googleVerified', 'Google hisobingiz tasdiqlandi:')} <strong>{googleSignup.email}</strong>.{' '}
                {t('auth.finishSignup', 'Ro‘yxatdan o‘tishni yakunlang.')}
              </p>
            </header>
            <Alert message={error} />
            <label>
              {t('auth.companyName')}
              <input
                name="companyName"
                required
                maxLength={160}
                autoComplete="organization"
                defaultValue={googleCompanyName}
              />
            </label>
            <label>
              {t('auth.fullName')}
              <input
                name="fullName"
                required
                maxLength={160}
                autoComplete="name"
                defaultValue={googleSignup.fullName}
              />
            </label>
            <button type="submit" disabled={busy} className="au-submit">
              {busy ? t('auth.creating', 'Yaratilmoqda…') : t('auth.createWorkspace', 'Workspace yaratish')}
            </button>
            <button
              type="button"
              className="au-link"
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
          <form ref={formRef} name={`auth-${mode}`} onSubmit={submit} className="au-form">
            <header>
              <h1>
                {token
                  ? t('auth.joinTeam')
                  : mode === 'login'
                    ? t('auth.welcomeBack')
                    : t('auth.makeRoom')}
              </h1>
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
                    <input
                      name="companyName"
                      required
                      maxLength={160}
                      autoComplete="organization"
                      placeholder="Acme Studio"
                    />
                  </label>
                )}
                <label>
                  {t('auth.fullName')}
                  <input
                    name="fullName"
                    required
                    maxLength={160}
                    autoComplete="name"
                    placeholder="Alex Morgan"
                  />
                </label>
              </>
            )}
            {!token && (
              <label>
                {t('auth.workEmail')}
                <input
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
                />
              </label>
            )}
            <label>
              {t('auth.password')}
              <span className="au-password">
                <input
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
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  aria-pressed={showPassword}
                  title={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                </button>
              </span>
            </label>
            <button type="submit" className="au-submit" disabled={busy}>
              {busy
                ? t('common.pleaseWait')
                : token
                  ? t('auth.joinWorkspace')
                  : mode === 'login'
                    ? t('auth.signIn')
                    : t('auth.createWorkspace')}
              {!busy && <ArrowRight size={18} aria-hidden="true" />}
            </button>
            {!token && (
              <p className="au-switch">
                {mode === 'login' ? t('auth.newToShortlist') : t('auth.alreadyHaveAccount')}{' '}
                <button
                  type="button"
                  className="au-link"
                  onClick={() => {
                    const nextMode = mode === 'login' ? 'register' : 'login';
                    setMode(nextMode);
                    onModeChange?.(nextMode);
                    setError('');
                  }}
                >
                  {mode === 'login' ? t('auth.createAWorkspace') : t('auth.signIn')}
                </button>
              </p>
            )}
            <p className="au-note">{t('auth.inviteNote')}</p>
          </form>
        )}
      </main>
    </div>
  );
}
