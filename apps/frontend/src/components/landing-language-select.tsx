import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { changeLanguage, languages, locales, type Locale } from '../i18n';
import { landingPathFor } from '../lib/landing-seo-html';
import { isLandingPath } from '../lib/seo';

/**
 * A small dependency-free dropdown (rounded list, keyboard and screen-reader friendly): the landing
 * page must not pull the Radix dropdown library, nor the auth module the full LanguageSwitcher needs,
 * into its first load. A native <select> cannot be styled because the browser draws its list.
 */
export function LandingLanguageSelect() {
  const { i18n, t } = useTranslation();
  const rawCurrent = (i18n.language || 'uz').split('-')[0] as Locale;
  const current = locales.includes(rawCurrent) ? rawCurrent : 'uz';
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // The list stays mounted for a moment after closing so it can fade out.
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function closeList() {
    setOpen(false);
    setClosing(true);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setClosing(false), 180);
  }

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) closeList();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function openList() {
    window.clearTimeout(closeTimer.current);
    setClosing(false);
    setActive(Math.max(0, locales.indexOf(current)));
    setOpen(true);
  }

  function choose(next: Locale) {
    closeList();
    button.current?.focus();
    if (next === current) return;
    void changeLanguage(next);
    // Keep the address bar on the URL that matches the language, so a shared link opens in it.
    if (isLandingPath(window.location.pathname)) {
      window.history.replaceState(window.history.state, '', landingPathFor(next));
    }
  }

  function onListKeyDown(event: KeyboardEvent) {
    const last = locales.length - 1;
    if (event.key === 'ArrowDown') setActive((index) => Math.min(last, index + 1));
    else if (event.key === 'ArrowUp') setActive((index) => Math.max(0, index - 1));
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(last);
    else if (event.key === 'Enter' || event.key === ' ') choose(locales[active]);
    else if (event.key === 'Escape' || event.key === 'Tab') {
      closeList();
      button.current?.focus();
      if (event.key === 'Escape') event.stopPropagation();
      return;
    } else return;
    event.preventDefault();
  }

  return (
    <div className="landing-lang-wrap" ref={root}>
      <button
        ref={button}
        type="button"
        className="landing-lang"
        aria-label={t('landing.language')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openList();
          }
        }}
      >
        <span key={current} className="landing-lang-label">
          {languages[current].nativeName}
        </span>
        <ChevronDown size={14} aria-hidden="true" className="landing-lang-chevron" />
      </button>
      {(open || closing) && (
        <ul
          ref={list}
          data-state={open ? 'open' : 'closed'}
          style={{ '--i': active } as CSSProperties}
          id={`${id}-list`}
          className="landing-lang-menu"
          role="listbox"
          tabIndex={-1}
          aria-label={t('landing.language')}
          aria-activedescendant={`${id}-${locales[active]}`}
          onKeyDown={onListKeyDown}
        >
          {locales.map((code, index) => (
            <li
              key={code}
              id={`${id}-${code}`}
              role="option"
              aria-selected={code === current}
              className={`landing-lang-option${index === active ? ' is-active' : ''}${code === current ? ' is-selected' : ''}`}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(code)}
            >
              <span>{languages[code].nativeName}</span>
              {code === current && <Check size={14} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
