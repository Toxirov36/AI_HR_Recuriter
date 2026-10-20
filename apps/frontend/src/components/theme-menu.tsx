import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from './ui/dropdown-menu';
import { isTheme } from '../lib/theme';
import { useTheme } from '../lib/use-theme';

const OPTIONS = [
  { value: 'light', icon: Sun, labelKey: 'navigation.themeLight' },
  { value: 'dark', icon: Moon, labelKey: 'navigation.themeDark' },
  { value: 'system', icon: Monitor, labelKey: 'navigation.themeSystem' },
] as const;

export function ThemeMenuGroup() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <>
      <DropdownMenuLabel className="px-2.5 pb-1 pt-2 text-xs font-medium text-slate-500">
        {t('navigation.theme')}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={(value) => {
          if (isTheme(value)) setTheme(value);
        }}
      >
        {OPTIONS.map(({ value, icon: Icon, labelKey }) => (
          <DropdownMenuRadioItem key={value} value={value} className="cursor-pointer">
            <Icon className="mr-2.5 h-4 w-4 text-slate-500" />
            <span>{t(labelKey)}</span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
