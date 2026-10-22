import { describe, expect, it } from 'vitest';
import { defaultSlotValue, formatInterviewTime } from './format';

const iso = '2026-10-23T11:15:00Z';

describe('interview time formatting', () => {
  it('writes Uzbek dates with real month names in the interview’s zone', () => {
    expect(formatInterviewTime(iso, 'Asia/Tashkent', 'uz')).toBe('23-oktabr 2026, 16:15');
    expect(formatInterviewTime('2026-01-02T20:00:00Z', 'Asia/Tashkent', 'uz-UZ')).toBe('3-yanvar 2026, 01:00');
  });

  it('uses Intl for English and Russian, and Russian month names for Tajik', () => {
    expect(formatInterviewTime(iso, 'Asia/Tashkent', 'en')).toContain('October 23, 2026');
    expect(formatInterviewTime(iso, 'Asia/Tashkent', 'ru')).toContain('октября 2026');
    expect(formatInterviewTime(iso, 'Asia/Tashkent', 'tg')).toContain('октября 2026');
  });

  it('falls back to a readable string for an unknown zone', () => {
    expect(formatInterviewTime(iso, 'Mars/Olympus', 'en')).toMatch(/2026/);
  });

  it('suggests a whole hour for a new slot', () => {
    expect(defaultSlotValue(24, new Date(2026, 9, 22, 10, 37))).toBe('2026-10-23T10:00');
  });
});
