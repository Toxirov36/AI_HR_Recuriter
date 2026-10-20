import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { defaultLocale, locales, type Locale } from './config';
import { detectInitialLocale, saveLocale } from './utils';

// Uzbek is the default and the fallback, so it ships in the main bundle.
// The other locales are separate chunks that load when they are first needed.
import uz from './locales/uz.json';

const localeLoaders: Record<Exclude<Locale, 'uz'>, () => Promise<{ default: object }>> = {
  ru: () => import('./locales/ru.json'),
  en: () => import('./locales/en.json'),
  tg: () => import('./locales/tg.json'),
};

export const resources = {
  uz: { translation: uz },
} as const;

/** Makes sure the translations for `locale` are registered with i18next. */
export async function ensureLocale(locale: Locale): Promise<void> {
  if (locale === 'uz' || i18n.hasResourceBundle(locale, 'translation')) return;
  const module = await localeLoaders[locale]();
  i18n.addResourceBundle(locale, 'translation', module.default, true, true);
}

const initialLocale = detectInitialLocale();

if (!i18n.isInitialized) {
  void i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: initialLocale,
      fallbackLng: defaultLocale,
      supportedLngs: locales as readonly string[],
      interpolation: {
        escapeValue: false, // React already escapes XSS
      },
      returnNull: false,
      returnEmptyString: false,
      react: {
        useSuspense: false,
      },
    });

  if (typeof document !== 'undefined') {
    document.documentElement.lang = initialLocale;
    document.documentElement.dir = 'ltr';
  }
}

// Every caller of i18n.changeLanguage (including tests) gets the locale loaded first.
const originalChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = (async (lng?: string, callback?: Parameters<typeof originalChangeLanguage>[1]) => {
  if (lng && (locales as readonly string[]).includes(lng)) await ensureLocale(lng as Locale);
  return originalChangeLanguage(lng, callback);
}) as typeof i18n.changeLanguage;

/** Resolves once the initial locale is ready, so the first render is not in the fallback language. */
export const localeReady: Promise<void> = ensureLocale(initialLocale)
  .then(() => i18n.changeLanguage(initialLocale))
  .then(() => undefined)
  .catch(() => undefined);

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
    document.documentElement.dir = 'ltr';
  }
});

/**
 * Changes active locale seamlessly across session and updates persistence.
 */
export async function changeLanguage(locale: Locale, userId?: number | string): Promise<void> {
  saveLocale(locale, userId);
  await i18n.changeLanguage(locale);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

export { i18n, useTranslation };
export default i18n;
export * from './config';
export * from './utils';
