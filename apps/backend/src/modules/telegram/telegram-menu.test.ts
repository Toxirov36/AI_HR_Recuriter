import { describe, expect, it, vi } from 'vitest';
import { botText } from './telegram-i18n';
import { mainMenuKeyboard, menuActionFor } from './telegram-menu';
import { TelegramMenuService } from './telegram-menu.service';

const user = { id: 42, first_name: 'Ali' };
const chat = { id: 42, type: 'private' as const };
const message = (text: string) => ({ message_id: 1, from: user, chat, date: 1, text });
const callback = (data: string) => ({ id: 'cb', from: user, message: { message_id: 1, chat }, data });
const buttons = (call: unknown[]) => (call[2] as any).replyMarkup.inline_keyboard.flat().map((b: any) => b.callback_data);

function setup({ language = 'uz', companyId = 3 as number | null, applied = false, fields = [] as any[], vacancies = [] as any[] } = {}) {
  const db: any = {
    vacancyField: {
      findMany: vi.fn().mockResolvedValue(fields),
      findFirst: vi.fn().mockResolvedValue({ id: 2, name: 'Marketing' }),
    },
    vacancy: { findMany: vi.fn().mockResolvedValue(vacancies) },
    candidate: { findUnique: vi.fn().mockResolvedValue({ id: 7 }) },
    application: { findFirst: vi.fn().mockResolvedValue(applied ? { id: 1 } : null) },
  };
  const telegram = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), answerCallbackQuery: vi.fn() };
  const languages = { get: vi.fn().mockResolvedValue(language), getCompany: vi.fn().mockResolvedValue(companyId), ask: vi.fn() };
  const applications = { show: vi.fn() };
  const join = { startVacancy: vi.fn() };
  const service = new TelegramMenuService(db, telegram as never, languages as never, applications as never, join as never);
  return { db, telegram, languages, applications, join, service };
}

describe('menu buttons', () => {
  it('recognises each button in every language', () => {
    for (const lang of ['uz', 'ru', 'tg'] as const) {
      expect(menuActionFor(botText(lang, 'menuFields'))).toBe('fields');
      expect(menuActionFor(botText(lang, 'myAppsButton'))).toBe('applications');
      expect(menuActionFor(botText(lang, 'menuLanguage'))).toBe('language');
      expect(menuActionFor(botText(lang, 'menuHelp'))).toBe('help');
    }
    expect(menuActionFor('hello')).toBeNull();
  });

  it('builds a two-row keyboard in the user’s language', () => {
    const keyboard = mainMenuKeyboard((key, params) => botText('ru', key, params));
    expect(keyboard.keyboard.flat().map((b) => b.text)).toEqual(['🗂 Сферы', '📋 Мои заявки', '🌐 Язык', '❓ Помощь']);
  });
});

describe('Telegram menu', () => {
  it('routes the buttons: applications, language, help and /menu', async () => {
    const { applications, languages, telegram, service } = setup();
    expect(await service.handleText(message('📋 Arizalarim') as never)).toBe(true);
    expect(applications.show).toHaveBeenCalledWith(42, '42');
    expect(await service.handleText(message('🌐 Til') as never)).toBe(true);
    expect(languages.ask).toHaveBeenCalledWith(42, '42');
    expect(await service.handleText(message('❓ Yordam') as never)).toBe(true);
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(42, botText('uz', 'menuHelpText'), expect.objectContaining({ replyMarkup: expect.anything() }));
    expect(await service.handleText(message('/menu') as never)).toBe(true);
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(42, botText('uz', 'menuPrompt'), expect.anything());
    expect(await service.handleText(message('just text') as never)).toBe(false);
  });

  it('lists the company’s fields with counts and a back button', async () => {
    const { db, telegram, service } = setup({ fields: [{ id: 2, name: 'Marketing', _count: { vacancies: 3 } }, { id: 4, name: 'IT', _count: { vacancies: 1 } }] });
    await service.handleText(message('🗂 Sohalar') as never);
    expect(db.vacancyField.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 3, isActive: true }) }));
    const call = telegram.sendMessage.mock.calls[0];
    expect(call[1]).toBe(botText('uz', 'fieldsTitle'));
    expect(buttons(call)).toEqual(['fld:2', 'fld:4', 'menu:home']);
    expect((call[2] as any).replyMarkup.inline_keyboard[0][0].text).toBe('Marketing (3)');
  });

  it('asks to open an HR link first when no company is known, and says when no field is open', async () => {
    const none = setup({ companyId: null });
    await none.service.handleText(message('🗂 Sohalar') as never);
    expect(none.telegram.sendMessage).toHaveBeenCalledWith(42, botText('uz', 'menuNoCompany'));

    const empty = setup();
    await empty.service.handleText(message('🗂 Sohalar') as never);
    expect(empty.telegram.sendMessage.mock.calls[0][1]).toBe(botText('uz', 'fieldsEmpty'));
  });

  it('shows a field’s vacancies with a back button to the fields', async () => {
    const { telegram, service } = setup({ vacancies: [{ id: 5, title: 'SMM Lead' }, { id: 6, title: 'Targetolog' }] });
    expect(await service.handleCallback(callback('fld:2') as never)).toBe(true);
    const call = telegram.sendMessage.mock.calls[0];
    expect(call[1]).toBe(botText('uz', 'fieldVacancies', { field: 'Marketing' }));
    expect(buttons(call)).toEqual(['fv:5', 'fv:6', 'menu:fields']);
  });

  it('closes a field the user already applied to', async () => {
    const { db, telegram, service } = setup({ applied: true });
    await service.handleCallback(callback('fld:2') as never);
    expect(db.application.findFirst).toHaveBeenCalledWith({ where: { companyId: 3, candidateId: 7, vacancy: { fieldId: 2 } }, select: { id: true } });
    expect(telegram.sendMessage.mock.calls[0][1]).toBe(botText('uz', 'alreadyAppliedField', { field: 'Marketing' }));
    expect(buttons(telegram.sendMessage.mock.calls[0])).toEqual(['my:apps', 'menu:fields']);
  });

  it('starts the application for the picked vacancy and goes back to the menu', async () => {
    const { join, telegram, service } = setup();
    expect(await service.handleCallback(callback('fv:5') as never)).toBe(true);
    expect(join.startVacancy).toHaveBeenCalledWith(expect.objectContaining({ from: user, chat: { id: 42, type: 'private' } }), 3, 5);
    await service.handleCallback(callback('menu:home') as never);
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(42, botText('uz', 'menuPrompt'), expect.anything());
  });

  it('ignores callbacks that are not menu buttons', async () => {
    const { telegram, service } = setup();
    expect(await service.handleCallback(callback('join:cancel') as never)).toBe(false);
    expect(telegram.answerCallbackQuery).not.toHaveBeenCalled();
  });
});
