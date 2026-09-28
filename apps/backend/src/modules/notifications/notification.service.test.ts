import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from './notification.service';
import type { Database } from '../../database/prisma.service';
import type { TelegramApiService } from '../telegram/telegram-api.service';
import type { EmailService } from './email.service';

describe('NotificationService (Telegram & Email Auto-Response)', () => {
  let service: NotificationService;
  let mockDb: any;
  let mockTelegramApi: any;
  let mockEmailService: any;

  beforeEach(() => {
    mockDb = {
      telegramBusinessConnection: {
        findFirst: vi.fn().mockResolvedValue({ id: 'biz_conn_99' }),
      },
      candidateEvent: {
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
    };
    mockTelegramApi = {
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
    };
    mockEmailService = {
      sendMail: vi.fn().mockResolvedValue({ success: true, messageId: 'sim-123' }),
    };

    service = new NotificationService(
      mockDb as unknown as Database,
      mockTelegramApi as unknown as TelegramApiService,
      mockEmailService as unknown as EmailService,
    );
  });

  describe('1. sendCvReceivedAck', () => {
    it('sends auto-reply to candidate via Telegram and records event', async () => {
      const candidate = {
        id: 10,
        fullName: 'Dilshodbek Toxirov',
        telegramUserId: '12345678',
        companyId: 1,
      };

      await service.sendCvReceivedAck(candidate, 'biz_conn_99');

      expect(mockTelegramApi.sendMessage).toHaveBeenCalledWith(
        '12345678',
        expect.stringContaining("Rezyumengiz muvaffaqiyatli qabul qilindi, AI ko'rib chiqmoqda"),
        { businessConnectionId: 'biz_conn_99' },
      );

      expect(mockDb.candidateEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          candidateId: 10,
          companyId: 1,
          type: 'TELEGRAM_AUTO_REPLY_SENT',
        }),
      });
    });

    it('does nothing if candidate has no telegramUserId', async () => {
      const candidate = {
        id: 11,
        fullName: 'Web Candidate',
        companyId: 1,
      };

      await service.sendCvReceivedAck(candidate);

      expect(mockTelegramApi.sendMessage).not.toHaveBeenCalled();
      expect(mockDb.candidateEvent.create).not.toHaveBeenCalled();
    });

    it('handles Telegram API error gracefully without throwing', async () => {
      mockTelegramApi.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      const candidate = {
        id: 10,
        fullName: 'Dilshodbek',
        telegramUserId: '12345678',
        companyId: 1,
      };

      await expect(service.sendCvReceivedAck(candidate)).resolves.not.toThrow();
    });
  });

  describe('2. sendInterviewInvitation', () => {
    it('dispatches interview invitation via both Telegram and Email', async () => {
      const candidate = {
        id: 20,
        fullName: 'Alisher Navoiy',
        email: 'alisher@example.com',
        telegramUserId: '987654321',
        companyId: 2,
      };
      const vacancy = {
        id: 5,
        title: 'Senior Frontend Developer',
      };

      const result = await service.sendInterviewInvitation({
        applicationId: 101,
        candidate,
        vacancy,
        companyName: 'Tech Corp',
      });

      expect(result.telegramSent).toBe(true);
      expect(result.emailSent).toBe(true);

      // Verify Telegram invitation message
      expect(mockTelegramApi.sendMessage).toHaveBeenCalledWith(
        '987654321',
        expect.stringContaining('suhbat (interview) bosqichiga taklif etamiz'),
        { businessConnectionId: 'biz_conn_99' },
      );

      // Verify Email invitation message
      expect(mockEmailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alisher@example.com',
          subject: expect.stringContaining('Senior Frontend Developer — Tech Corp'),
          text: expect.stringContaining('suhbatga taklif etamiz'),
        }),
      );

      // Verify Candidate Event timeline
      expect(mockDb.candidateEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          candidateId: 20,
          companyId: 2,
          type: 'INTERVIEW_INVITATION_SENT',
          label: expect.stringContaining('Telegram va Email'),
        }),
      });
    });

    it('sends only Telegram invitation if email is missing', async () => {
      const candidate = {
        id: 21,
        fullName: 'Telegram Only User',
        telegramUserId: '555666777',
        companyId: 2,
      };
      const vacancy = { id: 6, title: 'Go Developer' };

      const result = await service.sendInterviewInvitation({
        applicationId: 102,
        candidate,
        vacancy,
        companyName: 'Tech Corp',
      });

      expect(result.telegramSent).toBe(true);
      expect(result.emailSent).toBe(false);
      expect(mockEmailService.sendMail).not.toHaveBeenCalled();
      expect(mockDb.candidateEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'INTERVIEW_INVITATION_SENT',
          label: expect.stringContaining('Telegram'),
        }),
      });
    });

    it('does not retry a failed business invitation from the bot account', async () => {
      mockTelegramApi.sendMessage.mockResolvedValueOnce({ ok: false, description: 'Forbidden' });
      const result = await service.sendInterviewInvitation({
        applicationId: 103,
        candidate: { id: 22, fullName: 'Ali', telegramUserId: '555666777', companyId: 2 },
        vacancy: { id: 6, title: 'Developer' },
        companyName: 'Tech Corp',
      });
      expect(result.telegramSent).toBe(false);
      expect(mockTelegramApi.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockDb.candidateEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'TELEGRAM_DELIVERY_FAILED' }),
      });
    });
  });

  describe('3. sendRejectionNotice', () => {
    it('dispatches polite and motivational rejection note via Telegram and Email', async () => {
      const candidate = {
        id: 30,
        fullName: 'Bobur Mirzo',
        email: 'bobur@example.com',
        telegramUserId: '11223344',
        companyId: 3,
      };
      const vacancy = {
        id: 8,
        title: 'Product Manager',
      };

      const result = await service.sendRejectionNotice({
        applicationId: 201,
        candidate,
        vacancy,
        companyName: 'Global Inc',
      });

      expect(result.telegramSent).toBe(true);
      expect(result.emailSent).toBe(true);

      // Verify polite motivational tone in Telegram
      expect(mockTelegramApi.sendMessage).toHaveBeenCalledWith(
        '11223344',
        expect.stringContaining('kelgusi kasbiy faoliyatingizda'),
        { businessConnectionId: 'biz_conn_99' },
      );

      // Verify Email
      expect(mockEmailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'bobur@example.com',
          subject: expect.stringContaining('Product Manager — Global Inc'),
          text: expect.stringContaining('zaxiramizda saqlab qolamiz'),
        }),
      );

      // Verify Event timeline
      expect(mockDb.candidateEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          candidateId: 30,
          companyId: 3,
          type: 'REJECTION_NOTICE_SENT',
          label: expect.stringContaining('Muloyim rad javobi yuborildi'),
        }),
      });
    });

    it('does not throw when notification delivery fails', async () => {
      mockTelegramApi.sendMessage.mockRejectedValueOnce(new Error('Bot blocked by user'));
      mockEmailService.sendMail.mockRejectedValueOnce(new Error('SMTP connection timeout'));

      const candidate = {
        id: 31,
        fullName: 'Failing Recipient',
        email: 'fail@example.com',
        telegramUserId: '999999',
        companyId: 3,
      };

      const result = await service.sendRejectionNotice({
        applicationId: 202,
        candidate,
        vacancy: { id: 1, title: 'DevOps' },
        companyName: 'Acme',
      });

      expect(result.telegramSent).toBe(false);
      expect(result.emailSent).toBe(false);
      expect(mockTelegramApi.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. notifyRecruitersNewApplication', () => {
    it('sends Telegram alert with quick action buttons to active recruiters', async () => {
      mockDb.telegramBusinessConnection.findMany = vi.fn().mockResolvedValue([
        { userChatId: BigInt(777111), telegramUserId: BigInt(777111) },
      ]);

      await service.notifyRecruitersNewApplication({
        applicationId: 42,
        candidate: { id: 10, fullName: 'Rustam Axmedov', email: 'rustam@test.com', companyId: 1 },
        vacancy: { id: 5, title: 'Senior Backend Developer' },
        companyId: 1,
        source: 'Public Web form',
      });

      expect(mockTelegramApi.sendMessage).toHaveBeenCalledWith(
        '777111',
        expect.stringContaining('Yangi ariza kelib tushdi'),
        expect.objectContaining({
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: [
              [
                { text: "👁 Ko'rish", url: expect.stringContaining('/applications/42') },
                { text: "📅 Suhbatga chaqirish", callback_data: 'action:interview:42' },
              ],
            ],
          },
        }),
      );
    });
  });

  describe('5. notifyRecruitersStrongCandidate', () => {
    it('sends 85%+ match alert with quick action buttons and records event', async () => {
      mockDb.candidateEvent.findFirst = vi.fn().mockResolvedValue(null);
      mockDb.telegramBusinessConnection.findMany = vi.fn().mockResolvedValue([
        { userChatId: BigInt(777111), telegramUserId: BigInt(777111) },
      ]);

      await service.notifyRecruitersStrongCandidate({
        applicationId: 42,
        candidate: { id: 10, fullName: 'Rustam Axmedov', email: 'rustam@test.com', companyId: 1 },
        vacancy: { id: 5, title: 'Senior Backend Developer' },
        companyId: 1,
        matchPercentage: 92,
        supported: 5,
        partial: 1,
        notFound: 0,
        total: 6,
      });

      expect(mockTelegramApi.sendMessage).toHaveBeenCalledWith(
        '777111',
        expect.stringContaining('92% moslik'),
        expect.objectContaining({
          parseMode: 'HTML',
          replyMarkup: expect.objectContaining({
            inline_keyboard: [
              [
                { text: "👁 Nomzodni ko'rish", url: expect.stringContaining('/applications/42') },
                { text: "📅 Suhbatga chaqirish", callback_data: 'action:interview:42' },
              ],
            ],
          }),
        }),
      );

      expect(mockDb.candidateEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          candidateId: 10,
          companyId: 1,
          type: 'TELEGRAM_STRONG_MATCH_ALERT_SENT',
        }),
      });
    });
  });

  describe('6. getCompanyNotifications', () => {
    it('returns formatted recent feed of applications and interviews', async () => {
      mockDb.application = {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 101,
            candidate: { id: 1, fullName: 'Alisher', source: 'WEBSITE', email: 'a@b.com' },
            vacancy: { id: 2, title: 'Frontend Dev' },
            createdAt: new Date('2026-09-23T00:00:00Z'),
            updatedAt: new Date('2026-09-23T00:00:00Z'),
            analysis: {
              requirements: [{ status: 'SUPPORTED' }, { status: 'SUPPORTED' }],
            },
          },
        ]),
      };
      mockDb.applicationStageChange = {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 201,
            applicationId: 101,
            actorName: 'Aziz HR',
            createdAt: new Date('2026-09-23T00:10:00Z'),
            application: {
              candidate: { id: 1, fullName: 'Alisher' },
              vacancy: { id: 2, title: 'Frontend Dev' },
            },
          },
        ]),
      };

      const feed = await service.getCompanyNotifications(1);
      expect(feed.length).toBeGreaterThan(0);
      expect(feed.some((item) => item.type === 'STAGE_INTERVIEW')).toBe(true);
      expect(feed.some((item) => item.type === 'STRONG_MATCH')).toBe(true);
    });
  });
});
