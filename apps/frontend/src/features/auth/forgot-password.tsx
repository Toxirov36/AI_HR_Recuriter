import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError, send } from '../../lib/api';
import { Alert } from '../../components/ui';

const RESEND_SECONDS = 60;

/** Two steps: the email gets a 6-digit code, then the code and a new password are entered here. */
export function ForgotPasswordForm({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((left) => left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const message = (e: unknown) => {
    if (e instanceof ApiError && e.status === 429) return t('auth.resetTooMany');
    if (e instanceof ApiError && e.status === 400 && step === 'code') return t('auth.invalidCode');
    return (e as Error).message;
  };

  async function requestCode() {
    setBusy(true);
    setError('');
    try {
      await send('/auth/password-reset/request', { email, lang: i18n?.language?.slice(0, 2) || undefined });
      setStep('code');
      setWait(RESEND_SECONDS);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    const password = String(fields.get('password') ?? '');
    if (password !== fields.get('confirmPassword')) {
      setError(t('auth.passwordsMismatch'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await send('/auth/password-reset/confirm', { email, code: fields.get('code'), password });
      onDone();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  if (step === 'email')
    return (
      <form
        key="email"
        className="au-form"
        name="auth-forgot"
        onSubmit={(e) => {
          e.preventDefault();
          void requestCode();
        }}
      >
        <header>
          <h1>{t('auth.resetTitle')}</h1>
          <p>{t('auth.resetEmailHint')}</p>
        </header>
        <Alert message={error} />
        <label>
          {t('auth.workEmail')}
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value.trim())}
          />
        </label>
        <button type="submit" className="au-submit" disabled={busy}>
          {busy ? t('common.pleaseWait') : t('auth.sendCode')}
          {!busy && <ArrowRight size={18} aria-hidden="true" />}
        </button>
        <p className="au-switch">
          <button type="button" className="au-link" onClick={onBack}>
            {t('auth.backToLogin')}
          </button>
        </p>
      </form>
    );

  return (
    // Separate keys so React doesn't reuse the email input as the code input (it would keep the typed email)
    <form key="code" className="au-form" name="auth-reset" onSubmit={submitCode}>
      <header>
        <h1>{t('auth.resetTitle')}</h1>
        <p>
          {t('auth.codeSent')} <strong>{email}</strong>
        </p>
      </header>
      <Alert message={error} />
      <label>
        {t('auth.code')}
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          placeholder="000000"
          className="au-code"
        />
      </label>
      <label>
        {t('auth.newPassword')}
        <span className="au-password">
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            placeholder={t('auth.passwordPlaceholderRegister')}
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
      <label>
        {t('auth.confirmPassword')}
        <input
          name="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
        />
      </label>
      <button type="submit" className="au-submit" disabled={busy}>
        {busy ? t('common.pleaseWait') : t('auth.savePassword')}
        {!busy && <ArrowRight size={18} aria-hidden="true" />}
      </button>
      <p className="au-switch">
        <button type="button" className="au-link" disabled={busy || wait > 0} onClick={() => void requestCode()}>
          {wait > 0 ? t('auth.resendIn', { seconds: wait }) : t('auth.resendCode')}
        </button>
      </p>
      <p className="au-switch">
        <button type="button" className="au-link" onClick={onBack}>
          {t('auth.backToLogin')}
        </button>
      </p>
    </form>
  );
}
