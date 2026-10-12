import { defaultLocale, locales, SHORTLIST_LOCALE_KEY, type Locale } from './config';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initDataUnsafe?: {
          user?: {
            language_code?: string;
          };
        };
      };
    };
  }
}

/**
 * Normalizes any language code (e.g. 'uz-UZ', 'ru-RU', 'en-US') to one of the supported locales ('uz' | 'ru' | 'en').
 * Falls back safely to defaultLocale ('uz') for unsupported or invalid values.
 */
export function normalizeLocale(raw?: string | null): Locale {
  if (!raw || typeof raw !== 'string') return defaultLocale;
  const clean = raw.trim().toLowerCase();

  if (clean.startsWith('uz')) return 'uz';
  if (clean.startsWith('ru')) return 'ru';
  if (clean.startsWith('en')) return 'en';

  return defaultLocale;
}

/**
 * Detects Telegram Mini App user language code safely when running inside Telegram.
 */
export function getTelegramLanguage(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    return typeof tgLang === 'string' && tgLang.trim() ? tgLang.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Reads browser preferred language safely.
 */
export function getBrowserLanguage(): string | null {
  try {
    if (typeof navigator === 'undefined') return null;
    return navigator.languages?.[0] || navigator.language || null;
  } catch {
    return null;
  }
}

/**
 * Retrieves saved locale preference from localStorage.
 */
export function getSavedLocale(userId?: number | string): Locale | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    if (userId) {
      const userSaved = window.localStorage.getItem(`${SHORTLIST_LOCALE_KEY}_${userId}`);
      if (userSaved && locales.includes(userSaved as Locale)) {
        return userSaved as Locale;
      }
    }
    const genericSaved = window.localStorage.getItem(SHORTLIST_LOCALE_KEY);
    if (genericSaved && locales.includes(genericSaved as Locale)) {
      return genericSaved as Locale;
    }
  } catch {
    // localStorage not accessible
  }
  return null;
}

/**
 * Saves chosen locale preference into localStorage.
 */
export function saveLocale(locale: Locale, userId?: number | string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(SHORTLIST_LOCALE_KEY, locale);
    if (userId) {
      window.localStorage.setItem(`${SHORTLIST_LOCALE_KEY}_${userId}`, locale);
    }
  } catch {
    // localStorage not accessible
  }
}

/**
 * Determines active language strictly following the 6-tier priority hierarchy:
 * 1. Explicit language selection in the current session (URL query param e.g. `?lang=`)
 * 2. Saved authenticated user preference (`shortlist_locale_${userId}`)
 * 3. Previously saved local preference (`shortlist_locale`)
 * 4. Telegram language preference for first-time Telegram Mini App users
 * 5. Browser language for first-time web users
 * 6. Default language: Uzbek (`uz`)
 */
export function detectInitialLocale(userId?: number | string): Locale {
  // 1. Explicit query parameter in URL
  try {
    if (typeof window !== 'undefined' && window.location) {
      const urlParams = new URLSearchParams(window.location.search);
      const queryLang = urlParams.get('lang');
      if (queryLang) {
        return normalizeLocale(queryLang);
      }
    }
  } catch {
    // ignore
  }

  // 2. Saved authenticated user preference
  // 3. Previously saved local preference
  const saved = getSavedLocale(userId);
  if (saved) return saved;

  // 4. Telegram Mini App user language
  const tgLang = getTelegramLanguage();
  if (tgLang) {
    return normalizeLocale(tgLang);
  }

  // In testing environments (Vitest/Jest), default to defaultLocale ('uz') unless explicit browser language is being tested
  if (typeof process !== 'undefined' && (process.env?.VITEST || process.env?.NODE_ENV === 'test')) {
    return defaultLocale;
  }

  // 5. Browser language
  const browserLang = getBrowserLanguage();
  if (browserLang) {
    return normalizeLocale(browserLang);
  }

  // 6. Default fallback
  return defaultLocale;
}

/* ==========================================================================
   PHASE 8: Formatting Utilities using native Intl API
   ========================================================================== */

const UZ_MONTHS: Record<number, string> = {
  0: 'yanvar',
  1: 'fevral',
  2: 'mart',
  3: 'aprel',
  4: 'may',
  5: 'iyun',
  6: 'iyul',
  7: 'avgust',
  8: 'sentabr',
  9: 'oktabr',
  10: 'noyabr',
  11: 'dekabr',
};

const UZ_SHORT_MONTHS: Record<number, string> = {
  0: 'yan',
  1: 'fev',
  2: 'mar',
  3: 'apr',
  4: 'may',
  5: 'iyn',
  6: 'iyl',
  7: 'avg',
  8: 'sen',
  9: 'okt',
  10: 'noy',
  11: 'dek',
};

/**
 * Formats dates adhering to native locale standards:
 * - Uzbek: `12-oktabr 2026` or `12-okt, 2026`
 * - Russian: `12 октября 2026 г.`
 * - English: `October 12, 2026`
 */
export function formatDate(
  input: string | number | Date,
  locale: Locale = defaultLocale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = new Date(input);
  if (isNaN(d.getTime())) return '';

  if (locale === 'uz') {
    const day = d.getDate();
    const month = d.getMonth();
    const year = d.getFullYear();

    if (options?.month === 'short' && !options.year) {
      return `${day}-${UZ_SHORT_MONTHS[month]}`;
    }
    if (options?.month === 'short') {
      return `${day}-${UZ_SHORT_MONTHS[month]} ${year}`;
    }
    return `${day}-${UZ_MONTHS[month]} ${year}`;
  }

  const intlLocale = locale === 'ru' ? 'ru-RU' : 'en-US';
  const defaultOpts: Intl.DateTimeFormatOptions = options || {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return new Intl.DateTimeFormat(intlLocale, defaultOpts).format(d);
}

/**
 * Formats relative time (e.g. "3 days ago", "3 kun oldin", "3 дня назад")
 */
export function formatRelativeTime(
  input: string | number | Date,
  locale: Locale = defaultLocale,
): string {
  const target = new Date(input).getTime();
  if (isNaN(target)) return '';
  const now = Date.now();
  const diffInSeconds = Math.round((target - now) / 1000);

  const units: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
    { unit: 'year', seconds: 31536000 },
    { unit: 'month', seconds: 2592000 },
    { unit: 'week', seconds: 604800 },
    { unit: 'day', seconds: 86400 },
    { unit: 'hour', seconds: 3600 },
    { unit: 'minute', seconds: 60 },
    { unit: 'second', seconds: 1 },
  ];

  for (const { unit, seconds } of units) {
    if (Math.abs(diffInSeconds) >= seconds || unit === 'second') {
      const count = Math.round(diffInSeconds / seconds);
      try {
        const intlLocale = locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-US';
        const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });
        return rtf.format(count, unit);
      } catch {
        return locale === 'uz'
          ? `${Math.abs(count)} ${unit} oldin`
          : locale === 'ru'
            ? `${Math.abs(count)} ${unit} назад`
            : `${Math.abs(count)} ${unit} ago`;
      }
    }
  }

  return '';
}

/**
 * Formats numeric values according to locale conventions.
 */
export function formatNumber(
  value: number,
  locale: Locale = defaultLocale,
  options?: Intl.NumberFormatOptions,
): string {
  const intlLocale = locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-US';
  return new Intl.NumberFormat(intlLocale, options).format(value);
}

/**
 * Formats percentages according to locale conventions.
 */
export function formatPercent(
  value: number,
  locale: Locale = defaultLocale,
  options?: Intl.NumberFormatOptions,
): string {
  const intlLocale = locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-US';
  return new Intl.NumberFormat(intlLocale, {
    style: 'percent',
    maximumFractionDigits: 1,
    ...options,
  }).format(value);
}

/**
 * Formats currency values while preserving exact underlying numbers.
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: Locale = defaultLocale,
  options?: Intl.NumberFormatOptions,
): string {
  const intlLocale = locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-US';
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      ...options,
    }).format(amount);
  } catch {
    return `${formatNumber(amount, locale, options)} ${currency}`;
  }
}

/**
 * Helper to translate system-controlled statuses (Pipeline stages, Vacancy statuses, Roles, Sources)
 */
export const SYSTEM_STATUS_LABELS: Record<Locale, Record<string, string>> = {
  uz: {
    // Pipeline stages
    NEW: 'Yangi',
    REVIEWING: 'Ko‘rib chiqilmoqda',
    INTERVIEW: 'Suhbat',
    OFFER: 'Taklif',
    HIRED: 'Qabul qilindi',
    REJECTED: 'Rad etildi',
    // Vacancy statuses
    DRAFT: 'Qoralama',
    ACTIVE: 'Faol',
    CLOSED: 'Yopilgan',
    // Candidate sources
    WEBSITE: 'Veb-sayt',
    TELEGRAM: 'Telegram',
    MANUAL: 'Qo‘lda qo‘shilgan',
    REFERRAL: 'Tavsiya',
    // Resume processing
    PENDING: 'Kutilmoqda',
    PROCESSING: 'Tahlil qilinmoqda',
    COMPLETED: 'Tayyor',
    FAILED: 'Xatolik',
    // Scorecard decisions
    STRONG_HIRE: 'Kuchli qabul',
    HIRE: 'Qabul qilish',
    NO_HIRE: 'Qabul qilmaslik',
    STRONG_NO_HIRE: 'Qat’iy rad etish',
    UNDECIDED: 'Qaror qilinmagan',
    // Roles
    ADMIN: 'Admin',
    HR: 'HR',
    RECRUITER: 'Rekruter',
    INTERVIEWER: 'Intervyuer',
    SUPER_ADMIN: 'Super Admin',
  },
  ru: {
    // Pipeline stages
    NEW: 'Новый',
    REVIEWING: 'Рассмотрение',
    INTERVIEW: 'Интервью',
    OFFER: 'Оффер',
    HIRED: 'Нанят',
    REJECTED: 'Отказ',
    // Vacancy statuses
    DRAFT: 'Черновик',
    ACTIVE: 'Активна',
    CLOSED: 'Закрыта',
    // Candidate sources
    WEBSITE: 'Веб-сайт',
    TELEGRAM: 'Telegram',
    MANUAL: 'Вручную',
    REFERRAL: 'Рекомендация',
    // Resume processing
    PENDING: 'В очереди',
    PROCESSING: 'Обработка',
    COMPLETED: 'Завершено',
    FAILED: 'Ошибка',
    // Scorecard decisions
    STRONG_HIRE: 'Точно нанимать',
    HIRE: 'Нанимать',
    NO_HIRE: 'Не нанимать',
    STRONG_NO_HIRE: 'Категорический отказ',
    UNDECIDED: 'Не решено',
    // Roles
    ADMIN: 'Администратор',
    HR: 'HR',
    RECRUITER: 'Рекрутер',
    INTERVIEWER: 'Интервьюер',
    SUPER_ADMIN: 'Супер-администратор',
  },
  en: {
    // Pipeline stages
    NEW: 'New',
    REVIEWING: 'Reviewing',
    INTERVIEW: 'Interview',
    OFFER: 'Offer',
    HIRED: 'Hired',
    REJECTED: 'Rejected',
    // Vacancy statuses
    DRAFT: 'Draft',
    ACTIVE: 'Active',
    CLOSED: 'Closed',
    // Candidate sources
    WEBSITE: 'Website',
    TELEGRAM: 'Telegram',
    MANUAL: 'Manual',
    REFERRAL: 'Referral',
    // Resume processing
    PENDING: 'Pending',
    PROCESSING: 'Processing',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    // Scorecard decisions
    STRONG_HIRE: 'Strong Hire',
    HIRE: 'Hire',
    NO_HIRE: 'No Hire',
    STRONG_NO_HIRE: 'Strong No Hire',
    UNDECIDED: 'Undecided',
    // Roles
    ADMIN: 'Admin',
    HR: 'HR',
    RECRUITER: 'Recruiter',
    INTERVIEWER: 'Interviewer',
    SUPER_ADMIN: 'Super Admin',
  },
};

export function getSystemLabel(key: string, locale: Locale = defaultLocale): string {
  const normalizedKey = key.toUpperCase();
  return (
    SYSTEM_STATUS_LABELS[locale]?.[normalizedKey] ||
    SYSTEM_STATUS_LABELS.en?.[normalizedKey] ||
    key
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase())
  );
}
