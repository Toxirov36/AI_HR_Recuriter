import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../components/language-switcher';
import { ThemeToggle } from '../components/ui/theme-toggle';

const SECTIONS = ['controller', 'data', 'purpose', 'ai', 'storage', 'rights'] as const;

export function PrivacyPage() {
  const { t } = useTranslation();

  useEffect(() => {
    const previous = document.title;
    document.title = `${t('privacy.title')} · Shortlist`;
    return () => {
      document.title = previous;
    };
  }, [t]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft size={16} aria-hidden="true" /> {t('privacy.back')}
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{t('privacy.title')}</h1>
        <p className="mt-2 text-sm text-slate-500">{t('privacy.updated')}</p>
        <p className="mt-6 leading-7 text-slate-700">{t('privacy.intro')}</p>
        {SECTIONS.map((key) => (
          <section key={key} className="mt-8" aria-labelledby={`privacy-${key}`}>
            <h2 id={`privacy-${key}`} className="text-lg font-semibold">
              {t(`privacy.${key}Title`)}
            </h2>
            <p className="mt-2 leading-7 text-slate-700">{t(`privacy.${key}Text`)}</p>
          </section>
        ))}
      </main>
    </div>
  );
}
