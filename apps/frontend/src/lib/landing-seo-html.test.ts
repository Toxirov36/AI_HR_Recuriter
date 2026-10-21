import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import ru from '../i18n/locales/ru.json';
import uz from '../i18n/locales/uz.json';
import {
  applyLandingSeo,
  buildHeadSeo,
  escapeHtml,
  landingPathFor,
  localeFromLandingPath,
} from './landing-seo-html';

const SHELL = `<html lang="uz"><head><!--landing-seo:start--><!--landing-seo:end--></head><body><div id="root"></div><!--landing-body:start--><!--landing-body:end--></body></html>`;

describe('landing SEO markup', () => {
  it('maps languages to landing URLs and back', () => {
    expect(landingPathFor('uz')).toBe('/');
    expect(landingPathFor('ru')).toBe('/ru/');
    expect(localeFromLandingPath('/')).toBe('uz');
    expect(localeFromLandingPath('/en')).toBe('en');
    expect(localeFromLandingPath('/tg/')).toBe('tg');
    expect(localeFromLandingPath('/login')).toBeNull();
    expect(localeFromLandingPath('/ru/dashboard')).toBeNull();
  });

  it('lists every language and x-default as alternates in each head', () => {
    const head = buildHeadSeo('ru', ru.landing);
    for (const code of ['uz', 'ru', 'en', 'tg', 'x-default']) {
      expect(head).toContain(`hreflang="${code}"`);
    }
    expect(head).toContain('<link rel="canonical" href="https://hrdai.uz/ru/" />');
    expect(head).toContain('property="og:locale" content="ru_RU"');
  });

  it('emits valid JSON-LD with the FAQ of the page language', () => {
    const head = buildHeadSeo('en', en.landing);
    const json = /<script type="application\/ld\+json">(.*)<\/script>/.exec(head)![1];
    const graph = JSON.parse(json)['@graph'];
    const faq = graph.find((node: { '@type': string }) => node['@type'] === 'FAQPage');
    expect(faq.mainEntity).toHaveLength(5);
    expect(faq.mainEntity[0].name).toBe(en.landing.faq1Question);
  });

  it('swaps the marked blocks and the html lang, and is repeatable', () => {
    const uzPage = applyLandingSeo(SHELL, 'uz', uz.landing);
    const ruPage = applyLandingSeo(uzPage, 'ru', ru.landing, { robots: true });
    expect(ruPage).toContain('<html lang="ru"');
    expect(ruPage).toContain('name="robots" content="index, follow"');
    expect(ruPage).toContain(`<h1>${escapeHtml(ru.landing.heroTitle)}</h1>`);
    expect(ruPage).not.toContain(uz.landing.heroTitle);
    expect(ruPage.match(/<title>/g)).toHaveLength(1);
  });

  it('escapes translated text', () => {
    const page = applyLandingSeo(SHELL, 'en', { ...en.landing, heroTitle: '<b>"x"</b>' });
    expect(page).toContain('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  });
});
