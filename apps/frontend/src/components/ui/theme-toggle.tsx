import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { resolveTheme } from '@/lib/theme';
import { useTheme } from '@/lib/use-theme';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const isDark = resolveTheme(theme) === 'dark';
  const label = `${t('navigation.theme')}: ${isDark ? t('navigation.themeDark') : t('navigation.themeLight')}`;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white transition-colors duration-300 lg:w-16 lg:justify-start lg:p-1',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <Moon className="absolute left-2 hidden h-4 w-4 text-slate-400 lg:block" strokeWidth={1.5} aria-hidden />
      <Sun className="absolute right-2 hidden h-4 w-4 text-slate-400 lg:block" strokeWidth={1.5} aria-hidden />
      <span
        aria-hidden
        className={cn(
          'relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-300',
          isDark ? 'lg:translate-x-0' : 'lg:translate-x-8',
        )}
      >
        {isDark ? <Moon className="h-4 w-4" strokeWidth={1.5} /> : <Sun className="h-4 w-4" strokeWidth={1.5} />}
      </span>
    </button>
  );
}
