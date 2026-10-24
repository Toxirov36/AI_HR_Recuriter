import { useEffect, useState } from 'react';
import { getStoredTheme, setTheme, type RevealOrigin, type Theme } from './theme';

export function useTheme(): { theme: Theme; setTheme: (theme: Theme, origin?: RevealOrigin) => void } {
  const [theme, setCurrent] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    const sync = () => setCurrent(getStoredTheme());
    window.addEventListener('theme-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('theme-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return { theme, setTheme };
}
