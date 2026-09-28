import type SMTPTransport from 'nodemailer/lib/smtp-transport';

type SmtpConfig =
  { ok: true; from: string; options: SMTPTransport.Options } | { ok: false; error: string };

export function smtpOptions(env: NodeJS.ProcessEnv = process.env): SmtpConfig {
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'] as const;
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length)
    return { ok: false, error: `SMTP configuration missing: ${missing.join(', ')}` };
  const host = env.SMTP_HOST!.trim();
  if (/[\s@/:]/.test(host)) {
    return { ok: false, error: 'SMTP_HOST must be a server hostname, for example smtp.gmail.com.' };
  }
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'SMTP_PORT must be a port number between 1 and 65535.' };
  }
  const secureValue = env.SMTP_SECURE?.trim() || String(port === 465);
  if (!['true', 'false'].includes(secureValue)) {
    return { ok: false, error: 'SMTP_SECURE must be true or false.' };
  }
  const secure = secureValue === 'true';
  if ((port === 465 && !secure) || (port === 587 && secure)) {
    return { ok: false, error: 'Use SMTP_SECURE=true for port 465 or false for port 587.' };
  }
  return {
    ok: true,
    from: env.SMTP_FROM!.trim(),
    options: {
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: { user: env.SMTP_USER!.trim(), pass: env.SMTP_PASSWORD! },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      dnsTimeout: 10000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    },
  };
}

// Provider errors may contain addresses or credentials; expose only fixed messages.
export function smtpError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'EAUTH')
    return 'SMTP authentication failed. Check SMTP_USER and SMTP_PASSWORD (Gmail requires an app password).';
  if (code === 'ETIMEDOUT')
    return 'SMTP connection timed out. Check the host, port and network access.';
  if (code === 'EDNS' || code === 'ECONNECTION' || code === 'ESOCKET')
    return 'SMTP connection failed. Check the host, port and TLS settings.';
  if (code === 'EENVELOPE') return 'SMTP rejected the sender or recipient address.';
  return 'SMTP delivery failed. Check the email provider configuration.';
}
