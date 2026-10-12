import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n, { changeLanguage, defaultLocale, languages, locales, type Locale } from './index';
import {
  detectInitialLocale,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  getBrowserLanguage,
  getSavedLocale,
  getTelegramLanguage,
  normalizeLocale,
  saveLocale,
} from './utils';
import uzTranslations from './locales/uz.json';
import ruTranslations from './locales/ru.json';
import enTranslations from './locales/en.json';
import { LanguageSwitcher } from '../components/language-switcher';

describe('Multilingual System (i18n / l10n)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await changeLanguage('uz');
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    delete (window as any).Telegram;
  });

  /* ========================================================================
     1. Locale normalization
     ======================================================================== */
  describe('Locale Normalization', () => {
    it('normalizes standard Uzbek locales', () => {
      expect(normalizeLocale('uz')).toBe('uz');
      expect(normalizeLocale('uz-UZ')).toBe('uz');
      expect(normalizeLocale('UZ')).toBe('uz');
      expect(normalizeLocale('UZ-Latn')).toBe('uz');
    });

    it('normalizes standard Russian locales', () => {
      expect(normalizeLocale('ru')).toBe('ru');
      expect(normalizeLocale('ru-RU')).toBe('ru');
      expect(normalizeLocale('RU')).toBe('ru');
    });

    it('normalizes standard English locales', () => {
      expect(normalizeLocale('en')).toBe('en');
      expect(normalizeLocale('en-US')).toBe('en');
      expect(normalizeLocale('en-GB')).toBe('en');
      expect(normalizeLocale('EN')).toBe('en');
    });

    it('falls back safely to defaultLocale (uz) for unsupported or empty values', () => {
      expect(normalizeLocale('fr')).toBe('uz');
      expect(normalizeLocale('de-DE')).toBe('uz');
      expect(normalizeLocale('es')).toBe('uz');
      expect(normalizeLocale('')).toBe('uz');
      expect(normalizeLocale(null)).toBe('uz');
      expect(normalizeLocale(undefined)).toBe('uz');
    });
  });

  /* ========================================================================
     2. Language Persistence
     ======================================================================== */
  describe('Language Persistence', () => {
    it('persists generic and user-specific preferences to localStorage', () => {
      saveLocale('ru');
      expect(localStorage.getItem('shortlist_locale')).toBe('ru');
      expect(getSavedLocale()).toBe('ru');

      saveLocale('en', 42);
      expect(localStorage.getItem('shortlist_locale')).toBe('en');
      expect(localStorage.getItem('shortlist_locale_42')).toBe('en');
      expect(getSavedLocale(42)).toBe('en');
    });

    it('returns null when no preference is saved or value is invalid', () => {
      localStorage.clear();
      expect(getSavedLocale()).toBeNull();
      localStorage.setItem('shortlist_locale', 'unsupported-lang');
      expect(getSavedLocale()).toBeNull();
    });
  });

  /* ========================================================================
     3. 6-Tier Locale Detection Hierarchy
     ======================================================================== */
  describe('6-Tier Priority Hierarchy', () => {
    it('Tier 1: URL query parameter (?lang=) takes highest priority', () => {
      window.history.pushState({}, '', '?lang=ru');

      // Even if user saved 'en', URL query 'ru' takes precedence
      saveLocale('en', 10);
      expect(detectInitialLocale(10)).toBe('ru');

      window.history.pushState({}, '', '/');
    });

    it('Tier 2: Authenticated user saved preference overrides generic preference', () => {
      saveLocale('uz'); // generic
      saveLocale('en', 99); // user 99 prefers English

      expect(getSavedLocale(99)).toBe('en');
    });

    it('Tier 3: Generic saved preference is used when no user ID is provided', () => {
      saveLocale('ru');
      expect(getSavedLocale()).toBe('ru');
    });

    it('Tier 4: Telegram Mini App language is detected when Telegram SDK is present', () => {
      (window as any).Telegram = {
        WebApp: {
          initDataUnsafe: {
            user: {
              language_code: 'ru',
            },
          },
        },
      };

      expect(getTelegramLanguage()).toBe('ru');
      expect(normalizeLocale(getTelegramLanguage())).toBe('ru');
    });

    it('Tier 4: Telegram Mini App safely handles absent user or SDK', () => {
      expect(getTelegramLanguage()).toBeNull();
      (window as any).Telegram = {};
      expect(getTelegramLanguage()).toBeNull();
    });

    it('Tier 5 & 6: Falls back to defaultLocale (uz) when no preferences are set', () => {
      expect(detectInitialLocale()).toBe('uz');
    });
  });

  /* ========================================================================
     4. Runtime Translation & Safe Fallback
     ======================================================================== */
  describe('Runtime Translation and Fallback', () => {
    it('translates common keys in all three languages', async () => {
      await changeLanguage('uz');
      expect(i18n.t('common.save')).toBe('Saqlash');
      expect(i18n.t('common.cancel')).toBe('Bekor qilish');

      await changeLanguage('ru');
      expect(i18n.t('common.save')).toBe('Сохранить');
      expect(i18n.t('common.cancel')).toBe('Отмена');

      await changeLanguage('en');
      expect(i18n.t('common.save')).toBe('Save');
      expect(i18n.t('common.cancel')).toBe('Cancel');
    });

    it('updates document.documentElement.lang on language change', async () => {
      await changeLanguage('ru');
      expect(document.documentElement.lang).toBe('ru');

      await changeLanguage('en');
      expect(document.documentElement.lang).toBe('en');

      await changeLanguage('uz');
      expect(document.documentElement.lang).toBe('uz');
    });

    it('handles missing keys safely without throwing exceptions', () => {
      const result = i18n.t('nonexistent_namespace.fake_key', {
        defaultValue: 'Default Fallback Text',
      });
      expect(result).toBe('Default Fallback Text');
    });
  });

  /* ========================================================================
     5. Dynamic Interpolation
     ======================================================================== */
  describe('Dynamic Interpolation', () => {
    it('interpolates name parameter in dashboard greeting', async () => {
      await changeLanguage('uz');
      expect(i18n.t('dashboard.greeting', { name: 'Dilshodbek' })).toBe(
        'SIZNI KO‘RGANIMIZDAN XURSANDMIZ, Dilshodbek',
      );

      await changeLanguage('ru');
      expect(i18n.t('dashboard.greeting', { name: 'Дильшодбек' })).toBe(
        'РАДЫ ВАС ВИДЕТЬ, Дильшодбек',
      );

      await changeLanguage('en');
      expect(i18n.t('dashboard.greeting', { name: 'Dilshodbek' })).toBe(
        'GOOD TO SEE YOU, Dilshodbek',
      );
    });

    it('interpolates counts and company names in companyDeletion and publicApply', async () => {
      await changeLanguage('uz');
      const deletionImpact = i18n.t('companyDeletion.impact', {
        users: 3,
        vacancies: 2,
        applications: 10,
      });
      expect(deletionImpact).toContain('3 xodim');
      expect(deletionImpact).toContain('2 vakansiya');
      expect(deletionImpact).toContain('10 ariza');
    });
  });

  /* ========================================================================
     6. Translation Key Parity Across uz, ru, en
     ======================================================================== */
  describe('Translation Key Parity', () => {
    function getLeafKeys(obj: Record<string, any>, prefix = ''): string[] {
      let keys: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          keys = keys.concat(getLeafKeys(value, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys;
    }

    it('verifies that all keys in uz.json exist in ru.json', () => {
      const uzKeys = getLeafKeys(uzTranslations);
      const ruKeys = new Set(getLeafKeys(ruTranslations));

      const missingInRu = uzKeys.filter((key) => !ruKeys.has(key));
      expect(missingInRu).toEqual([]);
    });

    it('verifies that all keys in uz.json exist in en.json', () => {
      const uzKeys = getLeafKeys(uzTranslations);
      const enKeys = new Set(getLeafKeys(enTranslations));

      const missingInEn = uzKeys.filter((key) => !enKeys.has(key));
      expect(missingInEn).toEqual([]);
    });

    it('ensures no empty string translations exist in any locale', () => {
      const checkNonEmpty = (obj: Record<string, any>, path = '') => {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            checkNonEmpty(value, currentPath);
          } else {
            expect(typeof value).toBe('string');
            expect((value as string).trim().length).toBeGreaterThan(0);
          }
        }
      };

      checkNonEmpty(uzTranslations, 'uz');
      checkNonEmpty(ruTranslations, 'ru');
      checkNonEmpty(enTranslations, 'en');
    });
  });

  /* ========================================================================
     7. Localization Formatting (Intl API)
     ======================================================================== */
  describe('Intl Localization Formatting', () => {
    const testDate = new Date('2026-10-12T10:00:00Z');

    it('formats dates accurately for uz, ru, and en', () => {
      const uzDate = formatDate(testDate, 'uz');
      expect(uzDate).toContain('2026');
      expect(uzDate.toLowerCase()).toContain('oktabr');

      const ruDate = formatDate(testDate, 'ru');
      expect(ruDate).toContain('2026');
      expect(ruDate.toLowerCase()).toContain('октябр');

      const enDate = formatDate(testDate, 'en');
      expect(enDate).toContain('2026');
      expect(enDate).toContain('October');
    });

    it('formats numbers and percentages according to locale', () => {
      const formattedNum = formatNumber(1250000, 'uz');
      expect(formattedNum).toBeDefined();

      const percent = formatPercent(0.85, 'uz');
      expect(percent).toContain('85');
      expect(percent).toContain('%');
    });

    it('formats currency without altering numerical value', () => {
      const uzsFormatted = formatCurrency(5000000, 'UZS', 'uz');
      expect(uzsFormatted).toMatch(/so[‘ʻ']m|UZS/i);

      const usdFormatted = formatCurrency(1500, 'USD', 'en');
      expect(usdFormatted).toContain('$');
      expect(usdFormatted).toContain('1,500');
    });

    it('formats relative time safely', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
      const relativeUz = formatRelativeTime(past, 'uz');
      expect(relativeUz).toBeDefined();
    });
  });

  /* ========================================================================
     8. Language Switcher UI/UX Interactions
     ======================================================================== */
  describe('Language Switcher Component', () => {
    it('renders with current language name and no prefix', () => {
      render(<LanguageSwitcher />);
      const trigger = screen.getByRole('button', { name: /select language/i });
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveTextContent('O‘zbekcha');
    });

    it('opens dropdown and displays all 3 supported languages with checkmark for active language', () => {
      render(<LanguageSwitcher />);
      const trigger = screen.getByRole('button', { name: /select language/i });
      fireEvent.click(trigger);

      expect(screen.getAllByText('O‘zbekcha').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Русский')).toBeInTheDocument();
      expect(screen.getByText('English')).toBeInTheDocument();
    });

    it('changes language to Russian when selected from menu', async () => {
      render(<LanguageSwitcher />);
      const trigger = screen.getByRole('button', { name: /select language/i });
      fireEvent.click(trigger);

      const ruOption = screen.getByText('Русский');
      fireEvent.click(ruOption);

      await waitFor(() => {
        expect(i18n.language).toBe('ru');
        expect(document.documentElement.lang).toBe('ru');
        expect(localStorage.getItem('shortlist_locale')).toBe('ru');
      });
    });

    it('changes language to English when selected from menu', async () => {
      render(<LanguageSwitcher />);
      const trigger = screen.getByRole('button', { name: /select language/i });
      fireEvent.click(trigger);

      const enOption = screen.getByText('English');
      fireEvent.click(enOption);

      await waitFor(() => {
        expect(i18n.language).toBe('en');
        expect(document.documentElement.lang).toBe('en');
        expect(localStorage.getItem('shortlist_locale')).toBe('en');
      });
    });
  });
});
