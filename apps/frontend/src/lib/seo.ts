/** Only the landing page and the privacy policy should appear in search results. */
const INDEXABLE_PATHS = new Set(['/', '/privacy']);

export function robotsContentFor(pathname: string, search = ''): string {
  const invitation = pathname === '/' && new URLSearchParams(search).has('invite');
  return INDEXABLE_PATHS.has(pathname) && !invitation ? 'index, follow' : 'noindex, nofollow';
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
