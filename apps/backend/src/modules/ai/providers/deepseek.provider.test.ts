import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { textAiProvider } from '../../../config/app.config';
import { DeepSeekProvider } from './deepseek.provider';
import { GeminiProvider } from './gemini.provider';

const schema = z.object({ title: z.string(), score: z.number() });
const config = { DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_MODEL: 'deepseek-chat', DEEPSEEK_BASE_URL: 'https://api.deepseek.com/', AI_TIMEOUT_MS: 5000, AI_PROVIDER: 'auto', GEMINI_API_KEY: '' };
const security = (overrides: Record<string, unknown> = {}) => ({ config: { ...config, ...overrides } }) as never;
const reply = (content: string | null, finish = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content } }] }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('textAiProvider', () => {
  it('prefers DeepSeek when its key is set, falls back to Gemini, and honours a pinned provider', () => {
    expect(textAiProvider({ AI_PROVIDER: 'auto', DEEPSEEK_API_KEY: 'k', GEMINI_API_KEY: 'g' })).toBe('deepseek');
    expect(textAiProvider({ AI_PROVIDER: 'auto', DEEPSEEK_API_KEY: '', GEMINI_API_KEY: 'g' })).toBe('gemini');
    expect(textAiProvider({ AI_PROVIDER: 'gemini', DEEPSEEK_API_KEY: 'k', GEMINI_API_KEY: 'g' })).toBe('gemini');
    expect(textAiProvider({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: '', GEMINI_API_KEY: 'g' })).toBeNull();
    expect(textAiProvider({ AI_PROVIDER: 'auto', DEEPSEEK_API_KEY: '', GEMINI_API_KEY: '' })).toBeNull();
  });
});

describe('DeepSeekProvider', () => {
  it('asks for JSON mode with the schema in the prompt and validates the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('{"title":"Node.js","score":7}'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await new DeepSeekProvider(security()).generate(schema, 'Rate it.', { cv: 'x' }, 'You are an HR assistant.');
    expect(result).toEqual({ title: 'Node.js', score: 7 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'deepseek-chat', response_format: { type: 'json_object' }, stream: false });
    expect(body.messages[0].content).toContain('JSON Schema');
    expect(body.messages[0].content).toContain('"score"');
    expect(JSON.parse(body.messages[1].content)).toEqual({ cv: 'x' });
  });

  it('retries once when the reply is not valid for the schema, then fails clearly', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply('not json')).mockResolvedValueOnce(reply('{"title":"ok","score":1}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new DeepSeekProvider(security()).generate(schema, 't', {})).resolves.toEqual({ title: 'ok', score: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(reply('{"title":1}'))));
    await expect(new DeepSeekProvider(security()).generate(schema, 't', {})).rejects.toThrow(/incomplete response/);
  });

  it('treats a truncated reply as a failure instead of parsing partial JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(reply('{"title":"cut', 'length'))));
    await expect(new DeepSeekProvider(security()).generate(schema, 't', {})).rejects.toThrow(/incomplete response/);
  });

  it('maps provider errors to clear messages without leaking the key', async () => {
    for (const [status, message] of [[401, /DEEPSEEK_API_KEY/], [402, /balance/], [429, /limit or quota/]] as const) {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('{"error":"x"}', { status }))));
      const error = await new DeepSeekProvider(security()).generate(schema, 't', {}).catch((cause: Error) => cause);
      expect((error as Error).message).toMatch(message);
      expect((error as Error).message).not.toContain('sk-test');
    }
  });

  it('refuses to run without a key', async () => {
    await expect(new DeepSeekProvider(security({ DEEPSEEK_API_KEY: '' })).generate(schema, 't', {})).rejects.toThrow(/DEEPSEEK_API_KEY/);
  });
});

describe('GeminiProvider routing', () => {
  it('sends text generation to DeepSeek when it is active, and skips the Gemini-only embedding', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('{"title":"via deepseek","score":3}'));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GeminiProvider(security({ GEMINI_API_KEY: 'g' }));
    await expect(provider.generate(schema, 't', {}, 'sys', 'gemini-3.5-flash-lite')).resolves.toEqual({ title: 'via deepseek', score: 3 });
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.deepseek.com');
    expect(await provider.embed({ summary: 's', skills: [] } as never)).toBeNull();
  });

  it('still uses Gemini for text when no DeepSeek key is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"title":"via gemini","score":1}' }] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GeminiProvider(security({ DEEPSEEK_API_KEY: '', GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gemini-3.6-flash', GEMINI_FALLBACK_MODEL: '' }));
    await expect(provider.generate(schema, 't', {})).resolves.toEqual({ title: 'via gemini', score: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toContain('generativelanguage.googleapis.com');
  });
});
