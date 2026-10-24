export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'theme';
const THEMES: readonly Theme[] = ['light', 'dark', 'system'];
const THEME_COLORS = { light: '#153c36', dark: '#0c1613' } as const;

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function getStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function prefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;
}

export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
}

export type RevealOrigin = { x: number; y: number };

const REVEAL_MS = 900;
const REVEAL_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

function commitTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked; the theme still applies for this session.
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }));
}

/**
 * Changes the theme. With an origin (the toggle's centre) the new theme grows from that point as a circle that
 * covers the page; without View Transitions support, with reduced motion, or without an origin it switches at once.
 */
export function setTheme(theme: Theme, origin?: RevealOrigin): void {
  const doc = document as ViewTransitionDocument;
  const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const changes = resolveTheme(theme) !== resolveTheme(getStoredTheme());
  if (!origin || typeof doc.startViewTransition !== 'function' || reduceMotion || !changes) {
    commitTheme(theme);
    return;
  }
  const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y));
  const transition = doc.startViewTransition(() => commitTheme(theme));
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
        { duration: REVEAL_MS, easing: REVEAL_EASE, pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => undefined);
}

export function initTheme(): void {
  applyTheme(getStoredTheme());
  if (typeof window.matchMedia !== 'function') return;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system');
  });
}
