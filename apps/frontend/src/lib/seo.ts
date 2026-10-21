import { localeFromLandingPath } from './landing-seo-html';

/** Only the landing page (in every language) and the privacy policy should appear in search results. */
const INDEXABLE_PATHS = new Set(['/privacy']);

/** True for the landing page at the root and in each language (/ru/, /en/, /tg/). */
export function isLandingPath(pathname: string): boolean {
  return localeFromLandingPath(pathname) !== null;
}

export function robotsContentFor(pathname: string, search = ''): string {
  const invitation = isLandingPath(pathname) && new URLSearchParams(search).has('invite');
  const indexable = isLandingPath(pathname) || INDEXABLE_PATHS.has(pathname);
  return indexable && !invitation ? 'index, follow' : 'noindex, nofollow';
}

export function applyRobotsMeta(pathname: string, search = ''): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'robots';
    document.head.appendChild(meta);
  }
  meta.content = robotsContentFor(pathname, search);
}
