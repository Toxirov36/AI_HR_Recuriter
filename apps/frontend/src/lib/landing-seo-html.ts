import { defaultLocale, locales, type Locale } from '../i18n/config';

/**
 * Build-time SEO markup for the landing page. Search engines and link previews read the static
 * HTML only, so every language gets its own file with a localized head and a plain-text copy of the
 * page. The Vite plugin in vite.config.ts writes these files; the helpers here are pure.
 */
export const SITE_URL = 'https://hrdai.uz';
export const SITE_NAME = 'Shortlist';

const OG_LOCALES: Record<Locale, string> = { uz: 'uz_UZ', ru: 'ru_RU', en: 'en_US', tg: 'tg_TJ' };

export const SEO_START = '<!--landing-seo:start-->';
export const SEO_END = '<!--landing-seo:end-->';
export const BODY_START = '<!--landing-body:start-->';
export const BODY_END = '<!--landing-body:end-->';

/** Path of the landing page in a language: Uzbek lives at the site root. */
export function landingPathFor(locale: Locale): string {
  return locale === defaultLocale ? '/' : `/${locale}/`;
}

/** The language a landing URL stands for, or null for any other path. */
export function localeFromLandingPath(pathname: string): Locale | null {
  if (pathname === '/') return defaultLocale;
  const match = /^\/(ru|en|tg)\/?$/.exec(pathname);
  return match ? (match[1] as Locale) : null;
}

export function landingUrlFor(locale: Locale): string {
  return `${SITE_URL}${landingPathFor(locale)}`;
}

type Messages = Record<string, string>;

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function jsonLd(locale: Locale, landing: Messages): string {
  const url = landingUrlFor(locale);
  const faq = [1, 2, 3, 4, 5]
    .filter((n) => landing[`faq${n}Question`] && landing[`faq${n}Answer`])
    .map((n) => ({
      '@type': 'Question',
      name: landing[`faq${n}Question`],
      acceptedAnswer: { '@type': 'Answer', text: landing[`faq${n}Answer`] },
    }));
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/favicon.svg`,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        inLanguage: locales as readonly string[],
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${url}#app`,
        name: SITE_NAME,
        url,
        description: landing.heroText,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: locale,
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      { '@type': 'FAQPage', '@id': `${url}#faq`, url, inLanguage: locale, mainEntity: faq },
    ],
  };
  // "<" is escaped so no string in the data can close the script element.
  return JSON.stringify(graph).replaceAll('<', '\\u003c');
}

/** Everything the landing page puts in <head> for one language, between replaceable markers. */
export function buildHeadSeo(locale: Locale, landing: Messages, options: { robots?: boolean } = {}): string {
  const title = escapeHtml(`${landing.heroTitle} · ${SITE_NAME}`);
  const description = escapeHtml(landing.heroText);
  const url = landingUrlFor(locale);
  const alternates = locales
    .map((code) => `    <link rel="alternate" hreflang="${code}" href="${landingUrlFor(code)}" />`)
    .join('\n');
  const otherLocales = locales
    .filter((code) => code !== locale)
    .map((code) => `    <meta property="og:locale:alternate" content="${OG_LOCALES[code]}" />`)
    .join('\n');
  return [
    SEO_START,
    `    <title>${title}</title>`,
    `    <meta name="description" content="${description}" />`,
    options.robots ? '    <meta name="robots" content="index, follow" />' : '',
    `    <link rel="canonical" href="${url}" />`,
    alternates,
    `    <link rel="alternate" hreflang="x-default" href="${landingUrlFor(defaultLocale)}" />`,
    '    <meta property="og:type" content="website" />',
    `    <meta property="og:site_name" content="${SITE_NAME}" />`,
    `    <meta property="og:url" content="${url}" />`,
    `    <meta property="og:title" content="${title}" />`,
    `    <meta property="og:description" content="${description}" />`,
    `    <meta property="og:locale" content="${OG_LOCALES[locale]}" />`,
    otherLocales,
    `    <meta property="og:image" content="${SITE_URL}/og-image.png" />`,
    `    <meta property="og:image:alt" content="${SITE_NAME}" />`,
    '    <meta property="og:image:width" content="1200" />',
    '    <meta property="og:image:height" content="630" />',
    '    <meta name="twitter:card" content="summary_large_image" />',
    `    <meta name="twitter:title" content="${title}" />`,
    `    <meta name="twitter:description" content="${description}" />`,
    `    <meta name="twitter:image" content="${SITE_URL}/og-image.png" />`,
    `    <script type="application/ld+json">${jsonLd(locale, landing)}</script>`,
    `    ${SEO_END}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** A plain-text copy of the landing page for crawlers and readers that do not run scripts. */
export function buildBodySeo(landing: Messages): string {
  const list = (prefix: string, count: number, text: string) =>
    Array.from({ length: count }, (_, i) => i + 1)
      .filter((n) => landing[`${prefix}${n}Title`])
      .map((n) => `<li><h3>${escapeHtml(landing[`${prefix}${n}Title`])}</h3><p>${escapeHtml(landing[`${prefix}${n}${text}`])}</p></li>`)
      .join('');
  const faq = [1, 2, 3, 4, 5]
    .filter((n) => landing[`faq${n}Question`])
    .map((n) => `<dt>${escapeHtml(landing[`faq${n}Question`])}</dt><dd>${escapeHtml(landing[`faq${n}Answer`])}</dd>`)
    .join('');
  return [
    BODY_START,
    '<noscript>',
    `<h1>${escapeHtml(landing.heroTitle)}</h1>`,
    `<p>${escapeHtml(landing.heroText)}</p>`,
    `<h2>${escapeHtml(landing.featuresTitle)}</h2>`,
    `<ul>${list('feature', 3, 'Text')}</ul>`,
    `<h2>${escapeHtml(landing.howTitle)}</h2>`,
    `<ol>${list('step', 3, 'Text')}</ol>`,
    `<h2>${escapeHtml(landing.faqTitle)}</h2>`,
    `<dl>${faq}</dl>`,
    `<p><a href="/register">${escapeHtml(landing.startFree)}</a> · <a href="/login">${escapeHtml(landing.signIn)}</a></p>`,
    '</noscript>',
    BODY_END,
  ].join('\n    ');
}

/** Swaps the marked head and body blocks of a built page for another language's blocks. */
export function applyLandingSeo(
  html: string,
  locale: Locale,
  landing: Messages,
  options: { robots?: boolean } = {},
): string {
  const replaceBlock = (source: string, start: string, end: string, block: string) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end);
    if (from === -1 || to === -1 || to < from) throw new Error(`Landing SEO markers ${start} missing in index.html`);
    return source.slice(0, from) + block + source.slice(to + end.length);
  };
  const withHead = replaceBlock(html, SEO_START, SEO_END, buildHeadSeo(locale, landing, options));
  const withBody = replaceBlock(withHead, BODY_START, BODY_END, buildBodySeo(landing));
  return withBody.replace(/<html lang="[^"]*"/, `<html lang="${locale}"`);
}
