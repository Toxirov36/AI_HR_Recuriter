import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalRecruitingService } from '../external-recruiting/external-recruiting.service';
import { VacanciesService } from './vacancies.service';

const actor = { id: 2, companyId: 3, role: 'HR', fullName: 'Recruiter', email: 'hr@example.com' };

describe('automatic Telegram posting of new ACTIVE vacancies', () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  function vacancyService(previousStatus: string | null, savedStatus: string) {
    const db = { vacancy: { findUnique: vi.fn().mockResolvedValue(previousStatus ? { status: previousStatus } : null) } };
    const recruiting = { saveVacancy: vi.fn().mockResolvedValue({ id: 5, status: savedStatus }) };
    const external = { vacancyChanged: vi.fn(), autoPublishToTelegram: vi.fn().mockResolvedValue(undefined) };
    return { external, service: new VacanciesService(db as never, recruiting as never, external as never) };
  }

  it('triggers for a new ACTIVE vacancy and for a draft that becomes ACTIVE', async () => {
    const created = vacancyService(null, 'ACTIVE');
    await created.service.saveVacancy(3, null, {} as never, actor);
    await flush();
    expect(created.external.autoPublishToTelegram).toHaveBeenCalledWith(actor, 5);

    const activated = vacancyService('DRAFT', 'ACTIVE');
    await activated.service.saveVacancy(3, 5, {} as never, actor);
    await flush();
    expect(activated.external.autoPublishToTelegram).toHaveBeenCalledWith(actor, 5);
  });

  it('does not trigger for drafts, closed vacancies or edits of an already ACTIVE vacancy', async () => {
    for (const [previous, saved] of [[null, 'DRAFT'], ['ACTIVE', 'CLOSED'], ['ACTIVE', 'ACTIVE']] as const) {
      const { external, service } = vacancyService(previous, saved);
      await service.saveVacancy(3, previous ? 5 : null, {} as never, actor);
      await flush();
      expect(external.autoPublishToTelegram).not.toHaveBeenCalled();
    }
  });

  describe('ExternalRecruitingService.autoPublishToTelegram', () => {
    const setup = (autoPublish: boolean, channels: Array<{ id: number }>, token = 'bot-token') => {
      const db = {
        company: { findUnique: vi.fn().mockResolvedValue({ telegramAutoPublish: autoPublish }), update: vi.fn() },
        telegramChannel: { findMany: vi.fn().mockResolvedValue(channels) },
      };
      const service = new ExternalRecruitingService(db as never, { config: { TELEGRAM_BOT_TOKEN: token } } as never, {} as never, {} as never);
      const approve = vi.spyOn(service, 'approve').mockResolvedValue({ id: 1 } as never);
      return { db, service, approve };
    };

    it('does nothing unless the company opted in', async () => {
      const { service, approve } = setup(false, [{ id: 8 }]);
      await service.autoPublishToTelegram(actor, 5);
      expect(approve).not.toHaveBeenCalled();
    });

    it('posts to every connected channel and keeps going when one channel fails', async () => {
      const { service, approve } = setup(true, [{ id: 8 }, { id: 9 }]);
      approve.mockRejectedValueOnce(new Error('Bot cannot post to this channel'));
      await expect(service.autoPublishToTelegram(actor, 5)).resolves.toBeUndefined();
      expect(approve).toHaveBeenCalledWith(actor, 5, { platform: 'TELEGRAM', channelId: 8 });
      expect(approve).toHaveBeenCalledWith(actor, 5, { platform: 'TELEGRAM', channelId: 9 });
    });

    it('is a no-op without a bot token and never throws', async () => {
      const noToken = setup(true, [{ id: 8 }], '');
      await noToken.service.autoPublishToTelegram(actor, 5);
      expect(noToken.approve).not.toHaveBeenCalled();
      const broken = setup(true, []);
      broken.db.company.findUnique.mockRejectedValue(new Error('db down'));
      await expect(broken.service.autoPublishToTelegram(actor, 5)).resolves.toBeUndefined();
    });

    it('lets only a company admin change the setting', async () => {
      const { db, service } = setup(false, []);
      await expect(service.setTelegramAutoPublish(actor, true)).rejects.toThrow('administrator');
      await expect(service.setTelegramAutoPublish({ ...actor, role: 'ADMIN' }, true)).resolves.toEqual({ telegramAutoPublish: true });
      expect(db.company.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { telegramAutoPublish: true } });
    });
  });
});
