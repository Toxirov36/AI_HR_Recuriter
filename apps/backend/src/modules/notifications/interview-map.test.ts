import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { InterviewsService } from '../interviews/interviews.service';

const candidate = { id: 20, fullName: 'Ali Valiyev', email: 'ali@example.com', telegramUserId: '42', companyId: 2 };
const vacancy = { id: 5, title: 'SMM Lead' };
const when = new Date('2026-11-02T09:00:00Z');
const offline = { mode: 'OFFLINE' as const, durationMinutes: 45, timezone: 'Asia/Tashkent', startsAt: when, location: 'Amir Temur 1' };

function setup() {
  const db: any = {
    telegramBusinessConnection: { findFirst: vi.fn().mockResolvedValue({ id: 'biz1' }), findMany: vi.fn().mockResolvedValue([]) },
    telegramUserLanguage: { findUnique: vi.fn().mockResolvedValue({ language: 'uz' }) },
    candidateEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), sendVenue: vi.fn().mockResolvedValue({ ok: true }) };
  const email = { sendMail: vi.fn().mockResolvedValue({ success: true }) };
  const service = new NotificationService(db, telegram as never, email as never);
  (service as any).config = { FRONTEND_ORIGIN: 'https://hrdai.uz' };
  return { telegram, email, service };
}

describe('offline interview confirmation with a map', () => {
  it('sends a map pin and an open-map button when the link carries coordinates', async () => {
    const { telegram, service } = setup();
    await service.sendInterviewConfirmation({ candidate, vacancy, companyName: 'Acme', interview: { ...offline, mapUrl: 'https://www.google.com/maps/@41.3111,69.2797,17z', mapLat: 41.3111, mapLng: 69.2797 } });
    const [, text, options] = telegram.sendMessage.mock.calls[0];
    expect(text).toContain('📍 Manzil: Amir Temur 1');
    expect(JSON.stringify(options.replyMarkup)).toContain('google.com/maps');
    expect(JSON.stringify(options.replyMarkup)).toContain('Xaritada ochish');
    expect(telegram.sendVenue).toHaveBeenCalledWith('42', 41.3111, 69.2797, 'Acme', 'Amir Temur 1');
  });

  it('sends only the button for a link without coordinates, and nothing extra without a link', async () => {
    const short = setup();
    await short.service.sendInterviewConfirmation({ candidate, vacancy, companyName: 'Acme', interview: { ...offline, mapUrl: 'https://maps.app.goo.gl/AbCd', mapLat: null, mapLng: null } });
    expect(JSON.stringify(short.telegram.sendMessage.mock.calls[0][2].replyMarkup)).toContain('maps.app.goo.gl');
    expect(short.telegram.sendVenue).not.toHaveBeenCalled();

    const none = setup();
    await none.service.sendInterviewConfirmation({ candidate, vacancy, companyName: 'Acme', interview: offline });
    expect(none.telegram.sendMessage.mock.calls[0][2].replyMarkup).toBeUndefined();
    expect(none.telegram.sendVenue).not.toHaveBeenCalled();
  });

  it('never sends a pin for an online interview, or when Telegram did not deliver', async () => {
    const online = setup();
    await online.service.sendInterviewConfirmation({ candidate, vacancy, companyName: 'Acme', interview: { ...offline, mode: 'ONLINE', meetUrl: 'https://meet.google.com/a-b-c', mapLat: 41.3, mapLng: 69.2 } });
    expect(online.telegram.sendVenue).not.toHaveBeenCalled();

    const failed = setup();
    failed.telegram.sendMessage.mockResolvedValue({ ok: false });
    const result = await failed.service.sendInterviewConfirmation({ candidate, vacancy, companyName: 'Acme', interview: { ...offline, mapUrl: 'https://yandex.uz/maps/?ll=69.2797%2C41.3111', mapLat: 41.3111, mapLng: 69.2797 } });
    expect(result.telegramSent).toBe(false);
    expect(failed.telegram.sendVenue).not.toHaveBeenCalled();
  });

  it('a failing pin never breaks the confirmation', async () => {
    const { telegram, service } = setup();
    telegram.sendVenue.mockRejectedValue(new Error('boom'));
    const result = await service.sendInterviewConfirmation({ candidate, vacancy, companyName: 'Acme', interview: { ...offline, mapUrl: 'https://yandex.uz/maps/?ll=69.2797%2C41.3111', mapLat: 41.3111, mapLng: 69.2797 } });
    expect(result.telegramSent).toBe(true);
  });
});

describe('map link handling when HR schedules', () => {
  const mapFor = (...args: unknown[]) => (InterviewsService.prototype as any).mapFor.apply({}, args);

  it('stores a valid link with its coordinates, clears it for online or an empty value, keeps it on reschedule', () => {
    expect(mapFor('OFFLINE', 'https://www.google.com/maps/@41.3111,69.2797,17z')).toMatchObject({ mapLat: 41.3111, mapLng: 69.2797 });
    expect(mapFor('ONLINE', 'https://www.google.com/maps/@41.3111,69.2797,17z')).toEqual({ mapUrl: null, mapLat: null, mapLng: null });
    expect(mapFor('OFFLINE', '   ')).toEqual({ mapUrl: null, mapLat: null, mapLng: null });
    const keep = { mapUrl: 'https://yandex.uz/maps/', mapLat: 41.3, mapLng: 69.2 };
    expect(mapFor('OFFLINE', undefined, keep)).toEqual(keep);
  });

  it('refuses a link from an unknown site', () => {
    expect(() => mapFor('OFFLINE', 'https://evil.example.com/x')).toThrow(BadRequestException);
  });
});
