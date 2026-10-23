import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Building2,
  Check,
  ClipboardList,
  FileSearch,
  GitBranch,
  Layers3,
  Menu,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LandingLanguageSelect } from '../../components/landing-language-select';
import { normalizeLocale } from '../../i18n/utils';
import { landingUrlFor } from '../../lib/landing-seo-html';
import './landing.css';
import './landing.dark.css';
import './landing-sections.css';
import './landing-sections.dark.css';
import '@fontsource/unbounded/700.css';
import '@fontsource/unbounded/800.css';
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import './landing-a.css';

const NAV = [
  { href: '#telegram', key: 'navTelegram' },
  { href: '#features', key: 'navFeatures' },
  { href: '#for-whom', key: 'navWhom' },
  { href: '#pricing', key: 'navPricing' },
  { href: '#faq', key: 'navFaq' },
] as const;

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const title = `${t('landing.heroTitle')} · Shortlist`;
    const description = t('landing.heroText');
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    const url = landingUrlFor(normalizeLocale(i18n.language));
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', url);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
  }, [t, i18n.language]);

  const flow = [1, 2, 3, 4, 5].map((n) => ({
    number: n,
    title: t(`landing.flow${n}Title`),
    text: t(`landing.flow${n}Text`),
  }));
  const features = [
    { icon: ClipboardList, title: t('landing.feature1Title'), text: t('landing.feature1Text') },
    { icon: FileSearch, title: t('landing.feature2Title'), text: t('landing.feature2Text') },
    { icon: GitBranch, title: t('landing.feature3Title'), text: t('landing.feature3Text') },
  ];
  const audiences = [
    { icon: Briefcase, title: t('landing.whom1Title'), text: t('landing.whom1Text') },
    { icon: Building2, title: t('landing.whom2Title'), text: t('landing.whom2Text') },
    { icon: Users, title: t('landing.whom3Title'), text: t('landing.whom3Text') },
    { icon: TrendingUp, title: t('landing.whom4Title'), text: t('landing.whom4Text') },
  ];
  const steps = [
    { number: '01', title: t('landing.step1Title'), text: t('landing.step1Text') },
    { number: '02', title: t('landing.step2Title'), text: t('landing.step2Text') },
    { number: '03', title: t('landing.step3Title'), text: t('landing.step3Text') },
  ];
  const planFeatures = [1, 2, 3, 4, 5, 6].map((n) => t(`landing.plan${n}`));
  const questions = [1, 2, 3, 4, 5].map((n) => ({
    question: t(`landing.faq${n}Question`),
    answer: t(`landing.faq${n}Answer`),
  }));

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
            {NAV.map(({ href, key }) => (
              <a key={href} href={href}>
                {t(`landing.${key}`)}
              </a>
            ))}
          </nav>
          <div className="landing-header-actions">
            <LandingLanguageSelect />
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
            {NAV.map(({ href, key }) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {t(`landing.${key}`)}
              </a>
            ))}
            <Link to="/login">{t('landing.signIn')}</Link>
            <Link to="/register">{t('landing.startFree')}</Link>
            <LandingLanguageSelect />
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
              <a className="landing-text-link" href="#telegram">
                {t('landing.seeFlow')} <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="landing-trust">
              <ShieldCheck size={18} aria-hidden="true" /> {t('landing.trustNote')}
            </div>
          </div>
          <div className="landing-preview" aria-label={t('landing.chatLabel')}>
            <div className="landing-chat">
              <div className="landing-chat-head">
                <span className="landing-chat-avatar">
                  <Send size={17} aria-hidden="true" />
                </span>
                <div>
                  <strong>Shortlist bot</strong>
                  <small>{t('landing.chatStatus')}</small>
                </div>
              </div>
              <div className="landing-chat-body">
                <p className="landing-bubble landing-bubble-bot">{t('landing.chatField')}</p>
                <div className="landing-chip-row" aria-hidden="true">
                  <span className="landing-chip">SMM</span>
                  <span className="landing-chip landing-chip-active">IT</span>
                  <span className="landing-chip">Videograf</span>
                  <span className="landing-chip">{t('landing.chatOther')}</span>
                </div>
                <p className="landing-bubble landing-bubble-user">IT</p>
                <p className="landing-bubble landing-bubble-bot">{t('landing.chatName')}</p>
                <p className="landing-bubble landing-bubble-user">Aziz Karimov</p>
                <div className="landing-bubble landing-bubble-bot landing-bubble-result">
                  <strong>{t('landing.chatResult')}</strong>
                  <span>{t('landing.chatResultDetail')}</span>
                </div>
              </div>
            </div>
            <div className="landing-preview-note">
              <span>
                <Check size={17} />
              </span>
              <div>
                <strong>{t('landing.chatNoteTitle')}</strong>
                <small>{t('landing.chatNoteText')}</small>
              </div>
            </div>
          </div>
        </section>

        <section id="telegram" className="landing-section landing-flow" aria-labelledby="flow-title">
          <div className="landing-container">
            <div className="landing-section-head">
              <span className="landing-kicker">{t('landing.flowKicker')}</span>
              <h2 id="flow-title">{t('landing.flowTitle')}</h2>
              <p>{t('landing.flowIntro')}</p>
            </div>
            <ol className="landing-flow-grid">
              {flow.map((step) => (
                <li className="landing-flow-card" key={step.number}>
                  <span className="landing-flow-number">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
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

        <section id="for-whom" className="landing-section landing-whom" aria-labelledby="whom-title">
          <div className="landing-container">
            <div className="landing-section-head">
              <span className="landing-kicker">{t('landing.whomKicker')}</span>
              <h2 id="whom-title">{t('landing.whomTitle')}</h2>
              <p>{t('landing.whomIntro')}</p>
            </div>
            <div className="landing-whom-grid">
              {audiences.map(({ icon: Icon, title, text }) => (
                <article className="landing-whom-card" key={title}>
                  <span className="landing-feature-icon">
                    <Icon size={22} aria-hidden="true" />
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

        <section id="pricing" className="landing-section landing-pricing" aria-labelledby="pricing-title">
          <div className="landing-container landing-pricing-layout">
            <div className="landing-pricing-intro">
              <span className="landing-kicker">{t('landing.pricingKicker')}</span>
              <h2 id="pricing-title">{t('landing.pricingTitle')}</h2>
              <p>{t('landing.pricingIntro')}</p>
            </div>
            <div className="landing-plan">
              <span className="landing-plan-badge">{t('landing.planBadge')}</span>
              <h3>{t('landing.planName')}</h3>
              <div className="landing-plan-price">
                <strong>{t('landing.planPrice')}</strong>
                <span>{t('landing.planPriceNote')}</span>
              </div>
              <ul>
                {planFeatures.map((feature) => (
                  <li key={feature}>
                    <Check size={16} aria-hidden="true" /> {feature}
                  </li>
                ))}
              </ul>
              <Link className="landing-button" to="/register">
                {t('landing.startFree')} <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <p className="landing-plan-footnote">{t('landing.planFootnote')}</p>
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
          <Link to="/privacy">{t('privacy.title')}</Link>
          <Link to="/login">{t('landing.signIn')}</Link>
        </div>
      </footer>
    </div>
  );
}
