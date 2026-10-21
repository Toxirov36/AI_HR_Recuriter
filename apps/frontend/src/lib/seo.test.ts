import { beforeEach, describe, expect, it } from 'vitest';
import { applyRobotsMeta, robotsContentFor } from './seo';

describe('robots meta', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('indexes only the landing page and the privacy policy', () => {
    expect(robotsContentFor('/')).toBe('index, follow');
    expect(robotsContentFor('/privacy')).toBe('index, follow');
    for (const path of ['/login', '/register', '/dashboard', '/admin', '/platform-admin', '/apply/abc', '/candidates/5']) {
      expect(robotsContentFor(path)).toBe('noindex, nofollow');
    }
    expect(robotsContentFor('/', '?invite=token')).toBe('noindex, nofollow');
  });

  it('creates the meta tag once and updates it on navigation', () => {
    applyRobotsMeta('/login');
    applyRobotsMeta('/');
    const tags = document.querySelectorAll('meta[name="robots"]');
    expect(tags).toHaveLength(1);
    expect((tags[0] as HTMLMetaElement).content).toBe('index, follow');
  });
});
