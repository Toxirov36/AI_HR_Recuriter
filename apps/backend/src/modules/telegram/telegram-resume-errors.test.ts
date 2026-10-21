import { describe, expect, it } from 'vitest';
import { describeError } from './telegram-resume.processor';

describe('describeError', () => {
  it('keeps the cause but never a bot token', () => {
    const error = new Error('fetch failed https://api.telegram.org/file/bot123456:ABC-def_ghi/documents/x.pdf');
    const text = describeError(error);
    expect(text).toContain('Error: fetch failed');
    expect(text).not.toContain('123456:ABC');
    expect(text).toContain('bot***');
  });

  it('handles non-Error values and long messages', () => {
    expect(describeError('plain')).toBe('plain');
    expect(describeError(new Error('x'.repeat(1000))).length).toBe(300);
  });
});
