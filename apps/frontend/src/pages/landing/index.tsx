import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ClipboardList,
  FileSearch,
  GitBranch,
  Layers3,
  Menu,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../../components/language-switcher';
import './landing.css';

export function LandingPage() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const title = `${t('landing.heroTitle')} · Shortlist`;
    const description = t('landing.heroText');
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  }, [t]);

  const features = [
    { icon: ClipboardList, title: t('landing.feature1Title'), text: t('landing.feature1Text') },
    { icon: FileSearch, title: t('landing.feature2Title'), text: t('landing.feature2Text') },
    { icon: GitBranch, title: t('landing.feature3Title'), text: t('landing.feature3Text') },
  ];
  const steps = [
    { number: '01', title: t('landing.step1Title'), text: t('landing.step1Text') },
    { number: '02', title: t('landing.step2Title'), text: t('landing.step2Text') },
    { number: '03', title: t('landing.step3Title'), text: t('landing.step3Text') },
  ];
  const questions = [
    { question: t('landing.faq1Question'), answer: t('landing.faq1Answer') },
    { question: t('landing.faq2Question'), answer: t('landing.faq2Answer') },
    { question: t('landing.faq3Question'), answer: t('landing.faq3Answer') },
  ];

  return (
    <div className="landing-page">
      <a className="landing-skip" href="#landing-main">
        {t('landing.skip')}
      </a>
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link className="landing-brand" to="/" aria-label="Shortlist">
            <span className="landing-brand-mark">
              <Layers3 size={21} aria-hidden="true" />
            </span>
            shortlist<span className="landing-brand-dot">.</span>
          </Link>
          <nav className="landing-nav" aria-label={t('landing.navigation')}>
            <a href="#features">{t('landing.navFeatures')}</a>
            <a href="#how-it-works">{t('landing.navHow')}</a>
            <a href="#faq">{t('landing.navFaq')}</a>
          </nav>
          <div className="landing-header-actions">
            <LanguageSwitcher />
            <Link className="landing-signin" to="/login">
              {t('landing.signIn')}
            </Link>
            <Link className="landing-button landing-button-small" to="/register">
              {t('landing.startFree')} <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <button
            className="landing-menu-toggle"
            type="button"
            aria-label={menuOpen ? t('landing.closeMenu') : t('landing.openMenu')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <nav className="landing-mobile-nav" aria-label={t('landing.navigation')}>
            <a href="#features" onClick={() => setMenuOpen(false)}>
              {t('landing.navFeatures')}
            </a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
              {t('landing.navHow')}
            </a>
            <a href="#faq" onClick={() => setMenuOpen(false)}>
              {t('landing.navFaq')}
            </a>
            <Link to="/login">{t('landing.signIn')}</Link>
            <Link to="/register">{t('landing.startFree')}</Link>
            <LanguageSwitcher />
          </nav>
        )}
      </header>

      <main id="landing-main">
        <section className="landing-hero landing-container" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">
              <Sparkles size={15} aria-hidden="true" /> {t('landing.eyebrow')}
            </span>
            <h1 id="landing-title">{t('landing.heroTitle')}</h1>
            <p className="landing-hero-description">{t('landing.heroText')}</p>
            <div className="landing-hero-actions">
              <Link className="landing-button" to="/register">
                {t('landing.startFree')} <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a className="landing-text-link" href="#how-it-works">
                {t('landing.seeHow')} <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="landing-trust">
              <ShieldCheck size={18} aria-hidden="true" /> {t('landing.trustNote')}
            </div>
          </div>
          <div className="landing-preview" aria-label={t('landing.previewLabel')}>
            <div className="landing-preview-window">
              <div className="landing-preview-top">
                <div className="landing-preview-dots">
                  <i />
                  <i />
                  <i />
                </div>
                <span>shortlist / {t('landing.previewWorkspace')}</span>
              </div>
              <div className="landing-preview-body">
                <div className="landing-preview-sidebar">
                  <span className="landing-preview-side-brand">
                    <Layers3 size={17} /> shortlist.
                  </span>
                  <span className="landing-preview-side-active">
                    ▦ &nbsp; {t('landing.previewOverview')}
                  </span>
                  <span>▣ &nbsp; {t('landing.previewVacancies')}</span>
                  <span>◉ &nbsp; {t('landing.previewCandidates')}</span>
                  <span>◇ &nbsp; {t('landing.previewPipeline')}</span>
                </div>
                <div className="landing-preview-content">
                  <div className="landing-preview-heading">
                    <div>
                      <small>{t('landing.previewWorkspace')}</small>
                      <strong>{t('landing.previewOverview')}</strong>
                    </div>
                    <span className="landing-preview-avatar">HR</span>
                  </div>
                  <div className="landing-preview-stats">
                    <div>
                      <small>{t('landing.previewVacancies')}</small>
                      <strong>04</strong>
                    </div>
                    <div>
                      <small>{t('landing.previewCandidates')}</small>
                      <strong>28</strong>
                    </div>
                    <div>
                      <small>{t('landing.previewApplications')}</small>
                      <strong>16</strong>
                    </div>
                  </div>
                  <div className="landing-preview-list">
                    <div className="landing-preview-list-head">
                      <strong>{t('landing.previewPipeline')}</strong>
                      <span>•••</span>
                    </div>
                    <div className="landing-preview-row">
                      <span className="landing-preview-initial">A</span>
                      <div>
                        <b>Frontend Developer</b>
                        <small>{t('landing.previewReview')}</small>
                      </div>
                      <span className="landing-preview-pill">{t('landing.previewActive')}</span>
                    </div>
                    <div className="landing-preview-row">
                      <span className="landing-preview-initial landing-preview-initial-alt">B</span>
                      <div>
                        <b>Product Designer</b>
                        <small>{t('landing.previewReview')}</small>
                      </div>
                      <span className="landing-preview-pill">{t('landing.previewActive')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="landing-preview-note">
              <span>
                <Check size={17} />
              </span>
              <div>
                <strong>{t('landing.previewNoteTitle')}</strong>
                <small>{t('landing.previewNoteText')}</small>
              </div>
            </div>
          </div>
        </section>

        <section
          id="features"
          className="landing-section landing-features"
          aria-labelledby="features-title"
        >
          <div className="landing-container">
            <div className="landing-section-head">
              <span className="landing-kicker">{t('landing.featuresKicker')}</span>
              <h2 id="features-title">{t('landing.featuresTitle')}</h2>
              <p>{t('landing.featuresIntro')}</p>
            </div>
            <div className="landing-feature-grid">
              {features.map(({ icon: Icon, title, text }) => (
                <article className="landing-feature-card" key={title}>
                  <span className="landing-feature-icon">
                    <Icon size={24} aria-hidden="true" />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="landing-section landing-how"
          aria-labelledby="how-title"
        >
          <div className="landing-container landing-how-layout">
            <div className="landing-how-intro">
              <span className="landing-kicker">{t('landing.howKicker')}</span>
              <h2 id="how-title">{t('landing.howTitle')}</h2>
              <p>{t('landing.howIntro')}</p>
              <Link className="landing-text-link" to="/register">
                {t('landing.startFree')} <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="landing-steps">
              {steps.map((step) => (
                <div className="landing-step" key={step.number}>
                  <span>{step.number}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="landing-section landing-faq" aria-labelledby="faq-title">
          <div className="landing-container landing-faq-layout">
            <div>
              <span className="landing-kicker">FAQ</span>
              <h2 id="faq-title">{t('landing.faqTitle')}</h2>
              <p>{t('landing.faqIntro')}</p>
            </div>
            <div className="landing-faq-list">
              {questions.map(({ question, answer }) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-container landing-final-cta" aria-labelledby="final-cta-title">
          <div>
            <span className="landing-kicker">SHORTLIST</span>
            <h2 id="final-cta-title">{t('landing.ctaTitle')}</h2>
            <p>{t('landing.ctaText')}</p>
          </div>
          <Link className="landing-button landing-button-light" to="/register">
            {t('landing.startFree')} <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <span>
            shortlist<span className="landing-brand-dot">.</span>
          </span>
          <p>{t('landing.footer')}</p>
          <Link to="/login">{t('landing.signIn')}</Link>
        </div>
      </footer>
    </div>
  );
}
