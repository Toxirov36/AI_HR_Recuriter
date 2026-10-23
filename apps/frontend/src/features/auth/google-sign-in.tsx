import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../i18n';
import { api, send } from '../../lib/api';

type GoogleSdk = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        nonce: string;
        auto_select: boolean;
        itp_support?: boolean;
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (
        element: HTMLElement,
        options: { theme: string; size: string; text: string; width: number; locale?: string },
      ) => void;
      cancel: () => void;
    };
  };
};
type GoogleWindow = Window & { google?: GoogleSdk };
let sdkPromise: Promise<GoogleSdk> | null = null;
function loadGoogleSdk() {
  const existing = (window as GoogleWindow).google;
  if (existing) return Promise.resolve(existing);
  if (!sdkPromise) {
    sdkPromise = new Promise<GoogleSdk>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => {
        const sdk = (window as GoogleWindow).google;
        if (sdk) resolve(sdk);
        else reject(new Error('Google orqali kirishni yuklab bo‘lmadi.'));
      };
      script.onerror = () => {
        script.remove();
        reject(
          new Error('Google bilan bog‘lanib bo‘lmadi. Sahifani yangilab qayta urinib ko‘ring.'),
        );
      };
      document.head.appendChild(script);
    }).catch((error) => {
      sdkPromise = null;
      throw error;
    });
  }
  return sdkPromise;
}

export function GoogleSignInButton({
  disabled,
  onCredential,
  onError,
}: {
  disabled: boolean;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const activeSdk = useRef<GoogleSdk | null>(null);
  const renderedLocale = useRef<string | null>(null);
  const button = useRef<HTMLDivElement>(null);
  const latest = useRef({ disabled, onCredential, onError });
  latest.current = { disabled, onCredential, onError };
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  useEffect(() => {
    let cancelled = false;
    let sdk: GoogleSdk | undefined;
    void (async () => {
      try {
        const config = await api<{ configured: boolean; clientId: string | null }>(
          '/auth/google/config',
        );
        if (cancelled) return;
        if (!config.configured || !config.clientId) {
          setState('unavailable');
          return;
        }
        sdk = await loadGoogleSdk();
        if (cancelled) return;
        const { nonce } = await send<{ nonce: string }>('/auth/google/challenge', {});
        if (cancelled || !button.current) return;
        sdk.accounts.id.initialize({
          client_id: config.clientId,
          nonce,
          auto_select: false,
          itp_support: true,
          callback: ({ credential }) => {
            if (!cancelled && !latest.current.disabled) latest.current.onCredential(credential);
          },
        });
        const width = Math.max(200, Math.min(400, Math.floor(button.current.clientWidth || 400)));
        const locale = i18n.resolvedLanguage || i18n.language;
        sdk.accounts.id.renderButton(button.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          width,
          locale,
        });
        activeSdk.current = sdk;
        renderedLocale.current = locale;
        setState('ready');
      } catch (error) {
        if (!cancelled) {
          setState('unavailable');
          latest.current.onError((error as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
      activeSdk.current = null;
      renderedLocale.current = null;
      sdk?.accounts.id.cancel();
    };
  }, []);
  useEffect(() => {
    if (state !== 'ready' || !activeSdk.current || !button.current) return;
    const locale = i18n.resolvedLanguage || i18n.language;
    if (renderedLocale.current === locale) return;
    activeSdk.current.accounts.id.renderButton(button.current, {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      width: Math.max(200, Math.min(400, Math.floor(button.current.clientWidth || 400))),
      locale,
    });
    renderedLocale.current = locale;
  }, [state, i18n.resolvedLanguage, i18n.language]);

  return (
    <div className="auth-provider">
      {state !== 'ready' && (
        <button
          type="button"
          disabled
          className="auth-google-placeholder"
          title={state === 'unavailable' ? t('auth.googleUnavailable') : undefined}
        >
          <span className="font-bold text-lg text-blue-600" aria-hidden="true">
            G
          </span>
          {state === 'loading' ? t('auth.googleLoading') : t('auth.googleContinue')}
        </button>
      )}
      <div
        ref={button}
        className={`flex justify-center ${disabled ? 'pointer-events-none opacity-60' : ''}`}
        aria-busy={disabled}
      />
      {state === 'unavailable' && (
        <p className="text-xs text-slate-500 text-center">{t('auth.googleUnavailable')}</p>
      )}
      <div className="auth-provider-divider">
        {t('auth.googleEmailDivider')}
      </div>
    </div>
  );
}
