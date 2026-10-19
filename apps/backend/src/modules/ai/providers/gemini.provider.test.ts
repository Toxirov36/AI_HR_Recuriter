import { afterEach, describe, expect, it, vi } from 'vitest';
import { Security } from '../../../common/utils/security';
import { GeminiProvider } from './gemini.provider';

function provider() {
  return new GeminiProvider({
    config: {
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'gemini-3.6-flash',
      GEMINI_FALLBACK_MODEL: 'gemini-3.5-flash-lite',
      AI_TIMEOUT_MS: 5000,
    },
  } as unknown as Security);
}

describe('Gemini model fallback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the fallback model after the primary returns 503 twice', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 'ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().request('gemini-3.6-flash', 'generateContent', {})).resolves.toEqual({
      result: 'ok',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toContain('/models/gemini-3.5-flash-lite:generateContent');
  });

  it('uses the fallback model when the primary is rate limited', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 'ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().request('gemini-3.6-flash', 'generateContent', {})).resolves.toEqual({ result: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/models/gemini-3.5-flash-lite:generateContent');
  });

  it('reports quota exhaustion when the fallback is also rate limited', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().request('gemini-3.6-flash', 'generateContent', {})).rejects.toThrow('quota reached');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
