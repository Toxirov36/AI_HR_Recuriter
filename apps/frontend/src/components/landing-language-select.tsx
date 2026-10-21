import { useTranslation } from 'react-i18next';
import { changeLanguage, languages, locales, type Locale } from '../i18n';
import { landingPathFor } from '../lib/landing-seo-html';
import { isLandingPath } from '../lib/seo';

/**
 * A native select: the landing page must not pull the dropdown library (and the auth module
 * that the full LanguageSwitcher depends on) into its first load.
 */
export function LandingLanguageSelect() {
  const { i18n, t } = useTranslation();
  const current = (i18n.language || 'uz').split('-')[0] as Locale;
  return (
    <select
      className="landing-lang"
      aria-label={t('landing.language')}
      value={locales.includes(current) ? current : 'uz'}
      onChange={(event) => {
        const next = event.target.value as Locale;
        void changeLanguage(next);
        // Keep the address bar on the URL that matches the language, so a shared link opens in it.
        if (isLandingPath(window.location.pathname)) {
          window.history.replaceState(window.history.state, '', landingPathFor(next));
        }
      }}
    >
      {locales.map((code) => (
        <option key={code} value={code}>
          {languages[code].nativeName}
        </option>
      ))}
    </select>
  );
}
