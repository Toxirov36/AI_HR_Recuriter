import { useTranslation } from 'react-i18next';
import { changeLanguage, languages, locales, type Locale } from '../i18n';

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
      onChange={(event) => void changeLanguage(event.target.value as Locale)}
    >
      {locales.map((code) => (
        <option key={code} value={code}>
          {languages[code].nativeName}
        </option>
      ))}
    </select>
  );
}
