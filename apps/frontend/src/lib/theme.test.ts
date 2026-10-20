import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, getStoredTheme, isTheme, resolveTheme, setTheme } from './theme';

function mockSystemDark(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

describe('theme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
    document.head.innerHTML = '<meta name="theme-color" content="#153c36">';
    mockSystemDark(false);
  });
  afterEach(() => vi.restoreAllMocks());

  it('defaults to system and ignores invalid stored values', () => {
    expect(getStoredTheme()).toBe('system');
    window.localStorage.setItem('theme', 'purple');
    expect(getStoredTheme()).toBe('system');
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('purple')).toBe(false);
  });

  it('follows the system preference only in system mode', () => {
    mockSystemDark(true);
    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
  });

  it('applies the dark class, color scheme and theme-color meta', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0c1613');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists the choice and still applies it when storage is blocked', () => {
    setTheme('dark');
    expect(window.localStorage.getItem('theme')).toBe('dark');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setTheme('light')).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
