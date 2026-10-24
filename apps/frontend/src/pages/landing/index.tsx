import { ArrowRight, Check, Menu, Send, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '../../components/brand-mark';
import { LandingLanguageSelect } from '../../components/landing-language-select';
import { normalizeLocale } from '../../i18n/utils';
import { landingUrlFor } from '../../lib/landing-seo-html';
import '@fontsource/onest/700.css';
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import './landing.css';

/** Blocks that ease in as they scroll into view; siblings follow each other by a short beat. */
const REVEAL = ['.sl-step', '.sl-col', '.sl-fact'];

function useScrollReveal() {
  useEffect(() => {
    const root = document.querySelector('.sl-page');
    if (!root || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const items = REVEAL.flatMap((selector) => [...root.querySelectorAll<HTMLElement>(selector)]);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.remove('is-pending');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
    );
    for (const item of items) {
      const index = item.parentElement ? [...item.parentElement.children].indexOf(item) : 0;
      item.style.setProperty('--delay', `${Math.min(index, 5) * 80}ms`);
      item.classList.add('is-pending');
      observer.observe(item);
    }
    return () => observer.disconnect();
  }, []);
}

/** The id of the section being read, so the navigation can say where the visitor is. */
function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState('');
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        setActive(ids.find((id) => visible.has(id)) ?? '');
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    for (const id of ids) {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

/**
 * Jump to a section of the page with a soft, unhurried glide (ease in and out, longer for longer distances).
 * A wheel, touch or key press hands control back at once; reduced motion jumps straight there.
 */
function glideTo(event: React.MouseEvent<HTMLAnchorElement>, href: string, onDone?: () => void) {
  const id = href.slice(1);
  const target = document.getElementById(id);
  if (!target || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  onDone?.();
  const offset = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const from = window.scrollY;
  const to = Math.max(0, Math.round(target.getBoundingClientRect().top + from - offset));
  const finish = () => {
    window.history.replaceState(window.history.state, '', href);
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };
  const distance = Math.abs(to - from);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || distance < 4) {
    window.scrollTo(0, to);
    finish();
    return;
  }
  const duration = Math.min(1200, 650 + distance * 0.22);
  const start = performance.now();
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', stop);
  };
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('keydown', stop);
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = -(Math.cos(Math.PI * t) - 1) / 2;
    window.scrollTo(0, from + (to - from) * eased);
    if (t < 1) frame = requestAnimationFrame(step);
    else {
      stop();
      finish();
    }
  };
  frame = requestAnimationFrame(step);
}

const NAV = [
  { href: '#telegram', key: 'navTelegram' },
  { href: '#features', key: 'navFeatures' },
  { href: '#for-whom', key: 'navWhom' },
  { href: '#pricing', key: 'navPricing' },
  { href: '#faq', key: 'navFaq' },
] as const;
const SECTION_IDS = NAV.map((item) => item.href.slice(1));

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const active = useActiveSection(SECTION_IDS);
  useScrollReveal();

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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const flow = [1, 2, 3, 4, 5].map((n) => ({
    number: n,
    title: t(`landing.flow${n}Title`),
    text: t(`landing.flow${n}Text`),
  }));
  const facts = [1, 2, 3].map((n) => ({
    title: t(`landing.feature${n}Title`),
    text: t(`landing.feature${n}Text`),
  }));
  const audiences = [1, 2, 3, 4].map((n) => ({
    title: t(`landing.whom${n}Title`),
    text: t(`landing.whom${n}Text`),
  }));
  const steps = [1, 2, 3].map((n) => ({
    title: t(`landing.step${n}Title`),
    text: t(`landing.step${n}Text`),
  }));
  const planFeatures = [1, 2, 3, 4, 5, 6].map((n) => t(`landing.plan${n}`));
  const questions = [1, 2, 3, 4, 5].map((n) => ({
    question: t(`landing.faq${n}Question`),
    answer: t(`landing.faq${n}Answer`),
  }));
  // Sample candidates: the first one is the person who just finished the chat on the left.
  const ranked = [
    { name: 'Aziz Karimov', stage: 'dashStage1', match: 92 },
    { name: 'Malika Yusupova', stage: 'dashStage2', match: 81 },
    { name: 'Jasur Tursunov', stage: 'dashStage3', match: 67 },
  ];
  const board = [
    { stage: 'dashStage3', names: ['Jasur T.', 'Dilnoza R.', 'Bobur S.'] },
    { stage: 'dashStage2', names: ['Malika Y.', 'Otabek N.'] },
    { stage: 'dashStage1', names: ['Aziz K.'] },
    { stage: 'dashStage4', names: ['Sardor B.'] },
  ];

  return (
    <div className="sl-page">
      <a className="sl-skip" href="#landing-main">
        {t('landing.skip')}
      </a>
      <header className={`sl-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="sl-container sl-header-inner">
          <Link className="sl-brand" to="/" aria-label="Shortlist">
            <BrandMark size={34} />
            <span>
              shortlist<span className="sl-dot">.</span>
            </span>
          </Link>
          <nav className="sl-nav" aria-label={t('landing.navigation')}>
            {NAV.map(({ href, key }) => (
              <a
                key={href}
                href={href}
                aria-current={active === href.slice(1) ? 'location' : undefined}
                onClick={(event) => glideTo(event, href)}
              >
                {t(`landing.${key}`)}
              </a>
            ))}
          </nav>
          <div className="sl-header-actions">
            <LandingLanguageSelect />
            <Link className="sl-signin" to="/login">
              {t('landing.signIn')}
            </Link>
            <Link className="sl-button sl-button-small" to="/register">
              {t('landing.startFree')}
            </Link>
          </div>
          <button
            className="sl-menu-toggle"
            type="button"
            aria-label={menuOpen ? t('landing.closeMenu') : t('landing.openMenu')}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-nav"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
        {menuOpen && (
          <nav id="landing-mobile-nav" className="sl-mobile-nav" aria-label={t('landing.navigation')}>
            {NAV.map(({ href, key }) => (
              <a key={href} href={href} onClick={(event) => glideTo(event, href, () => setMenuOpen(false))}>
                {t(`landing.${key}`)}
              </a>
            ))}
            <Link to="/login">{t('landing.signIn')}</Link>
            <Link className="sl-button" to="/register">
              {t('landing.startFree')} <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </nav>
        )}
      </header>

      <main id="landing-main">
        <section className="sl-hero sl-container" aria-labelledby="landing-title">
          <div className="sl-hero-copy">
            <h1 id="landing-title">{t('landing.heroTitle')}</h1>
            <p className="sl-lead">{t('landing.heroText')}</p>
            <div className="sl-hero-actions">
              <Link className="sl-button" to="/register">
                {t('landing.startFree')} <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a className="sl-link" href="#telegram" onClick={(event) => glideTo(event, '#telegram')}>
                {t('landing.seeFlow')}
              </a>
            </div>
            <p className="sl-trust">
              <ShieldCheck size={18} aria-hidden="true" /> {t('landing.trustNote')}
            </p>
          </div>

          <div className="sl-stage">
            <div className="sl-chat" role="img" aria-label={t('landing.chatLabel')}>
              <div className="sl-chat-head">
                <span className="sl-chat-avatar">
                  <Send size={16} aria-hidden="true" />
                </span>
                <div>
                  <strong>Shortlist bot</strong>
                  <small>{t('landing.chatStatus')}</small>
                </div>
              </div>
              <div className="sl-chat-body">
                <p className="sl-bubble sl-bubble-bot">{t('landing.chatField')}</p>
                <div className="sl-chips">
                  <span>SMM</span>
                  <span className="is-on">IT</span>
                  <span>Video</span>
                  <span>{t('landing.chatOther')}</span>
                </div>
                <p className="sl-bubble sl-bubble-user">IT</p>
                <p className="sl-bubble sl-bubble-bot">{t('landing.chatName')}</p>
                <p className="sl-bubble sl-bubble-user">Aziz Karimov</p>
                <p className="sl-bubble sl-bubble-bot sl-bubble-result">
                  <strong>{t('landing.chatScore')}</strong>
                  <span>{t('landing.chatResultDetail')}</span>
                </p>
              </div>
            </div>

            <div className="sl-panel" role="img" aria-label={t('landing.dashLabel')}>
              <div className="sl-panel-head">
                <div>
                  <strong>{t('landing.dashTitle')}</strong>
                  <small>{t('landing.dashSort')}</small>
                </div>
                <span className="sl-sample">{t('landing.dashSample')}</span>
              </div>
              <ol className="sl-rank">
                {ranked.map((person, index) => (
                  <li key={person.name} className={index === 0 ? 'is-top' : undefined}>
                    <span className="sl-avatar">{person.name[0]}</span>
                    <div className="sl-rank-who">
                      <strong>{person.name}</strong>
                      <small>{t(`landing.${person.stage}`)}</small>
                    </div>
                    <div className="sl-rank-score">
                      <b>{person.match}%</b>
                      <i style={{ ['--w' as string]: `${person.match}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
              <div className="sl-summary">
                <strong>{t('landing.dashSummaryTitle')}</strong>
                <p>{t('landing.dashSummary')}</p>
                <span className="sl-summary-action">
                  {t('landing.dashInvite')} <ArrowRight size={16} aria-hidden="true" />
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="telegram" className="sl-flow" aria-labelledby="flow-title">
          <div className="sl-container sl-flow-layout">
            <div className="sl-flow-intro">
              <h2 id="flow-title">{t('landing.flowTitle')}</h2>
              <p>{t('landing.flowIntro')}</p>
            </div>
            <ol className="sl-steps">
              {flow.map((step) => (
                <li className="sl-step" key={step.number}>
                  <span className="sl-step-n">{step.number}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="sl-section sl-container" aria-labelledby="features-title">
          <div className="sl-head">
            <h2 id="features-title">{t('landing.featuresTitle')}</h2>
            <p>{t('landing.featuresIntro')}</p>
          </div>
          <div className="sl-board" role="img" aria-label={t('landing.boardLabel')}>
            {board.map((column) => (
              <div className="sl-col" key={column.stage}>
                <h3>{t(`landing.${column.stage}`)}</h3>
                {column.names.map((name) => (
                  <div className="sl-card" key={name}>
                    <span className="sl-avatar">{name[0]}</span>
                    {name}
                  </div>
                ))}
              </div>
            ))}
            <span className="sl-sample sl-board-sample">{t('landing.dashSample')}</span>
          </div>
          <div className="sl-facts">
            {facts.map((fact) => (
              <div className="sl-fact" key={fact.title}>
                <h3>{fact.title}</h3>
                <p>{fact.text}</p>
              </div>
            ))}
          </div>
          <div className="sl-control">
            <ShieldCheck size={28} aria-hidden="true" />
            <div>
              <h3>{t('landing.controlTitle')}</h3>
              <p>{t('landing.controlText')}</p>
            </div>
          </div>
        </section>

        <section id="for-whom" className="sl-section sl-container sl-whom" aria-labelledby="whom-title">
          <div className="sl-head sl-head-stack">
            <h2 id="whom-title">{t('landing.whomTitle')}</h2>
            <p>{t('landing.whomIntro')}</p>
          </div>
          <dl className="sl-whom-list">
            {audiences.map((item) => (
              <div key={item.title}>
                <dt>{item.title}</dt>
                <dd>{item.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="pricing" className="sl-section sl-container sl-pricing" aria-labelledby="pricing-title">
          <div className="sl-pricing-copy">
            <h2 id="pricing-title">{t('landing.pricingTitle')}</h2>
            <p className="sl-lead">{t('landing.pricingIntro')}</p>
            <h3 className="sl-small-title">{t('landing.howTitle')}</h3>
            <ul className="sl-start">
              {steps.map((step) => (
                <li key={step.title}>
                  <strong>{step.title}</strong>
                  <span>{step.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="sl-plan">
            <span className="sl-plan-badge">{t('landing.planBadge')}</span>
            <h3>{t('landing.planName')}</h3>
            <div className="sl-plan-price">
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
            <Link className="sl-button sl-button-lime" to="/register">
              {t('landing.ctaButton')} <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <p className="sl-plan-note">{t('landing.planFootnote')}</p>
          </div>
        </section>

        <section id="faq" className="sl-section sl-container sl-faq" aria-labelledby="faq-title">
          <div className="sl-head sl-head-stack">
            <h2 id="faq-title">{t('landing.faqTitle')}</h2>
            <p>{t('landing.faqIntro')}</p>
          </div>
          <div className="sl-faq-list">
            {questions.map(({ question, answer }) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="sl-container sl-final" aria-labelledby="final-cta-title">
          <div>
            <h2 id="final-cta-title">{t('landing.ctaTitle')}</h2>
            <p>{t('landing.ctaText')}</p>
          </div>
          <Link className="sl-button sl-button-lime" to="/register">
            {t('landing.ctaButton')} <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className="sl-footer">
        <div className="sl-container sl-footer-inner">
          <span className="sl-footer-brand">
            shortlist<span className="sl-dot">.</span>
          </span>
          <p>{t('landing.footer')}</p>
          <Link to="/privacy">{t('privacy.title')}</Link>
          <Link to="/login">{t('landing.signIn')}</Link>
        </div>
      </footer>
    </div>
  );
}
