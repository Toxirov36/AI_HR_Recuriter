import { Inject, Injectable } from '@nestjs/common';
import { Database } from '../../database/prisma.service';
import { TelegramApiService } from './telegram-api.service';
import { TelegramLanguageService } from './telegram-language.service';
import { botText, type BotMessageKey } from './telegram-i18n';

const MAX_LISTED = 10;
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const formatDate = (date: Date) =>
  `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`;

/** "Arizalarim": every application the Telegram user has submitted, across companies. */
@Injectable()
export class TelegramMyApplicationsService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(TelegramApiService) private telegram: TelegramApiService,
    @Inject(TelegramLanguageService) private languages: TelegramLanguageService,
  ) {}

  async show(chatId: number, userId: string) {
    const lang = await this.languages.get(userId);
    const tr = (key: BotMessageKey, params?: Record<string, string | number>) => botText(lang, key, params);
    const where = { candidate: { telegramUserId: userId } };
    const [applications, total] = await Promise.all([
      this.db.application.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_LISTED,
        select: {
          createdAt: true,
          status: true,
          assessmentScore: true,
          company: { select: { name: true } },
          vacancy: { select: { title: true, field: { select: { name: true } } } },
        },
      }),
      this.db.application.count({ where }),
    ]);

    if (!applications.length) {
      await this.telegram.sendMessage(chatId, tr('myAppsEmpty'));
      return;
    }
    const items = applications.map((application, index) => {
      const lines = [`${index + 1}. <b>${escapeHtml(application.vacancy.title)}</b> — ${escapeHtml(application.company.name)}`];
      if (application.vacancy.field) lines.push(`${tr('labelField')}: ${escapeHtml(application.vacancy.field.name)}`);
      const status = tr(`status${application.status}` as BotMessageKey);
      const test = application.assessmentScore == null ? '' : ` · ${tr('labelTest')}: ${application.assessmentScore}%`;
      lines.push(`${tr('labelStatus')}: ${status}${test}`);
      lines.push(`📅 ${formatDate(application.createdAt)}`);
      return lines.join('\n');
    });
    const more = total > applications.length ? `\n\n${tr('myAppsMore', { count: total - applications.length })}` : '';
    await this.telegram.sendMessage(chatId, `${tr('myAppsTitle')}\n\n${items.join('\n\n')}${more}`, { parseMode: 'HTML' });
  }
}
