import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { changeLanguage, languages, locales, type Locale } from '../i18n';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { useAuth } from '../features/auth';

interface LanguageSwitcherProps {
  variant?: 'compact' | 'full' | 'ghost';
  className?: string;
  align?: 'start' | 'center' | 'end';
}

export function LanguageSwitcher({
  variant = 'full',
  className,
  align = 'end',
}: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  let user: any = null;
  try {
    const auth = useAuth();
    user = auth?.user;
  } catch {
    // Auth context may not exist on public or pre-auth pages
  }

  const currentLocale = (locales.includes(i18n.language as Locale)
    ? i18n.language
    : 'uz') as Locale;
  const currentLang = languages[currentLocale] || languages.uz;

  const [open, setOpen] = useState(false);

  const handleSelect = async (code: Locale) => {
    if (code !== currentLocale) {
      await changeLanguage(code, user?.id);
    }
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white px-3.5 py-1.5 text-sm font-normal text-slate-800 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:scale-[0.98]',
            variant === 'ghost' &&
              'border-transparent bg-transparent shadow-none hover:bg-slate-100',
            className,
          )}
          aria-label={`Select language. Currently ${currentLang.nativeName}`}
          title={currentLang.nativeName}
          id="language-switcher-trigger"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="text-sm font-normal text-slate-800 select-none">
            {currentLang.nativeName}
          </span>
          <ChevronDown
            size={14}
            className={cn(
              'text-slate-500 shrink-0 stroke-[2.2] transition-transform duration-200 ml-0.5',
              open && 'rotate-180',
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={6}
        className="w-44 p-1.5 rounded-2xl border border-slate-200/90 bg-white shadow-xl z-50 animate-in fade-in-50 zoom-in-95"
      >
        <div className="space-y-0.5">
          {locales.map((code) => {
            const item = languages[code];
            const isSelected = code === currentLocale;
            return (
              <DropdownMenuItem
                key={code}
                onClick={() => void handleSelect(code)}
                className={cn(
                  'flex items-center justify-between w-full px-3.5 py-2 text-sm rounded-xl cursor-pointer transition-colors outline-none select-none',
                  isSelected
                    ? 'text-[#2563eb] font-medium hover:bg-slate-100/70 focus:bg-slate-100/70'
                    : 'text-slate-800 hover:bg-slate-100 focus:bg-slate-100',
                )}
              >
                <span>{item.nativeName}</span>
                {isSelected && (
                  <Check size={16} className="text-[#2563eb] stroke-[2.2] shrink-0 ml-auto" />
                )}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
