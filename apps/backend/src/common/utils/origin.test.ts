import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './origin';

describe('development origins', () => {
  const configured = 'http://localhost:5173';
  it('accepts loopback aliases only at the configured port and protocol', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(isAllowedOrigin(`http://${host}:5173`, configured, 'development')).toBe(true);
    }
    for (const origin of ['http://localhost:5174', 'https://localhost:5173', 'http://localhost.evil.com:5173', 'null', 'http://127.0.0.1:5173/path']) {
      expect(isAllowedOrigin(origin, configured, 'development')).toBe(false);
    }
  });
  it('preserves exact matching outside development', () => {
    expect(isAllowedOrigin(configured, configured, 'production')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173', configured, 'production')).toBe(false);
    expect(isAllowedOrigin('http://127.0.0.1:5173', configured, 'test')).toBe(false);
    expect(isAllowedOrigin(configured, 'https://example.com', 'development')).toBe(false);
  });
});
