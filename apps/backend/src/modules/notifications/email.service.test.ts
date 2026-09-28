import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const smtp = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), createTransport: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: smtp.createTransport } }));
vi.mock('../../config/app.config', () => ({ getConfig: () => ({ NODE_ENV: 'development' }) }));
import { EmailService } from './email.service';
import { smtpError, smtpOptions } from './smtp.config';

const validEnv = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'sender@example.com',
  SMTP_PASSWORD: 'test-secret',
  SMTP_FROM: 'Team <sender@example.com>',
};
const mail = {
  to: 'recipient@example.com',
  subject: 'Invitation',
  text: 'Interview details',
  html: '<p>Interview details</p>',
};

beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries(validEnv)) vi.stubEnv(key, value);
  smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail, close: smtp.close });
});
afterEach(() => vi.unstubAllEnvs());

describe('EmailService', () => {
  it('sends real mail in development and returns the provider message id', async () => {
    smtp.sendMail.mockResolvedValue({
      accepted: [mail.to],
      rejected: [],
      messageId: '<provider-id>',
    });
    expect(await new EmailService().sendMail(mail)).toEqual({
      success: true,
      messageId: '<provider-id>',
      simulated: false,
    });
    expect(smtp.sendMail).toHaveBeenCalledWith({ ...mail, from: validEnv.SMTP_FROM });
    expect(smtp.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: false,
        requireTLS: true,
        auth: { user: validEnv.SMTP_USER, pass: validEnv.SMTP_PASSWORD },
      }),
    );
    expect(smtp.close).toHaveBeenCalled();
  });
  it('does not report success when SMTP is unconfigured', async () => {
    vi.stubEnv('SMTP_PASSWORD', '');
    expect(await new EmailService().sendMail(mail)).toEqual({
      success: false,
      error: expect.stringContaining('SMTP_PASSWORD'),
    });
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });
  it('sanitizes authentication errors and closes the connection', async () => {
    smtp.sendMail.mockRejectedValue({
      code: 'EAUTH',
      message: 'secret-password recipient@example.com',
    });
    const result = await new EmailService().sendMail(mail);
    expect(result.success).toBe(false);
    expect(result.error).toContain('authentication failed');
    expect(JSON.stringify(result)).not.toContain('secret-password');
    expect(smtp.close).toHaveBeenCalled();
  });
  it('does not record delivery when the server accepts no recipient', async () => {
    smtp.sendMail.mockResolvedValue({ accepted: [], rejected: [mail.to], messageId: 'id' });
    expect((await new EmailService().sendMail(mail)).success).toBe(false);
  });
});

describe('SMTP configuration', () => {
  it('rejects an email address in SMTP_HOST', () => {
    expect(smtpOptions({ ...validEnv, SMTP_HOST: 'someone@gmail.com' }).ok).toBe(false);
  });
  it.each([
    { SMTP_PORT: '465', SMTP_SECURE: 'false' },
    { SMTP_PORT: '587', SMTP_SECURE: 'true' },
    { SMTP_PORT: 'invalid' },
    { SMTP_SECURE: 'yes' },
  ])('rejects incompatible settings: %j', (overrides) => {
    expect(smtpOptions({ ...validEnv, ...overrides }).ok).toBe(false);
  });
  it('enables immediate TLS on port 465', () => {
    expect(smtpOptions({ ...validEnv, SMTP_PORT: '465', SMTP_SECURE: 'true' })).toMatchObject({
      ok: true,
      options: { secure: true, requireTLS: false },
    });
  });
  it('sanitizes timeouts and unknown errors', () => {
    expect(smtpError({ code: 'ETIMEDOUT' })).toContain('timed out');
    expect(smtpError(new Error('password-leak'))).not.toContain('password-leak');
  });
});
