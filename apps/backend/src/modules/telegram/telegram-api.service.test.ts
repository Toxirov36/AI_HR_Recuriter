import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
const config = vi.hoisted(() => ({ TELEGRAM_BOT_TOKEN: 'test-only-token' }));
vi.mock('../../config/app.config', () => ({ getConfig: () => config }));
import { TelegramApiService } from './telegram-api.service';

describe('Telegram bot identity', () => {
  beforeEach(() => { config.TELEGRAM_BOT_TOKEN = 'test-only-token'; });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('uses and caches the identity returned by Telegram, including its real id', async () => {
    const bot = { id: 123, username: 'my_Ai_hr_recruiter_bot', first_name: 'HR Recruiter' };
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: bot }) });
    vi.stubGlobal('fetch', fetch);
    const api = new TelegramApiService();
    expect(await api.getMe()).toEqual(bot);
    expect(await api.getMe()).toEqual(bot);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects missing configuration without generating an unrelated bot identity', async () => {
    config.TELEGRAM_BOT_TOKEN = '';
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(new TelegramApiService().getMe()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['unauthorized', 'missing username', 'network error'])('rejects %s and allows a later retry', async (failure) => {
    const fetch = vi.fn();
    if (failure === 'network error') fetch.mockRejectedValueOnce(new Error('Network unavailable'));
    else fetch.mockResolvedValueOnce({ ok: failure !== 'unauthorized', json: async () =>
      failure === 'missing username' ? { ok: true, result: { id: 123 } } : { ok: false } });
    const bot = { id: 123, username: 'my_Ai_hr_recruiter_bot', first_name: 'HR Recruiter' };
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: bot }) });
    vi.stubGlobal('fetch', fetch);
    const api = new TelegramApiService();
    await expect(api.getMe()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await api.getMe()).toEqual(bot);
  });
});
