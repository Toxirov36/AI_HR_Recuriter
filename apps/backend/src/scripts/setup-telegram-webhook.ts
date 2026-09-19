import { getConfig } from '../config/app.config';

async function main() {
  const config = getConfig();
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_WEBHOOK_SECRET)
    throw new Error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET first');
  if (!config.TELEGRAM_WEBHOOK_URL.startsWith('https://'))
    throw new Error('TELEGRAM_WEBHOOK_URL must be a public HTTPS endpoint');

  const response = await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: config.TELEGRAM_WEBHOOK_URL,
        secret_token: config.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: [
          'business_connection',
          'business_message',
          'edited_business_message',
          'deleted_business_messages',
        ],
      }),
    },
  );
  const result = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !result.ok)
    throw new Error(result.description || 'Telegram setWebhook failed');
  console.log('Telegram webhook configured successfully.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Telegram webhook setup failed');
  process.exitCode = 1;
});
