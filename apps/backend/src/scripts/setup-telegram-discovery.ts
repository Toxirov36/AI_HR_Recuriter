import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Writable } from 'node:stream';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import qrCodeTerminal from 'qrcode-terminal';
import { getConfig, telegramSessionPath } from '../config/app.config';

async function main() {
  const config = getConfig();
  if (!config.TELEGRAM_API_ID || !config.TELEGRAM_API_HASH || !config.TELEGRAM_USER_SESSION_FILE) {
    throw new Error('Set TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_USER_SESSION_FILE first');
  }
  if (!stdin.isTTY) throw new Error('Run this setup in an interactive terminal');
  const sessionFile = telegramSessionPath(config.TELEGRAM_USER_SESSION_FILE);
  if (
    await access(sessionFile)
      .then(() => true)
      .catch(() => false)
  ) {
    throw new Error(
      'Telegram session file already exists. Revoke and remove it before reconnecting.',
    );
  }
  let muted = false;
  const safeOutput = new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (!muted) stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: stdin, output: safeOutput, terminal: true });
  const question = (label: string, secret = false) => {
    if (!secret) return rl.question(label);
    stdout.write(label);
    muted = true;
    return rl.question('').finally(() => {
      muted = false;
      stdout.write('\n');
    });
  };
  const client = new TelegramClient(
    new StringSession(''),
    config.TELEGRAM_API_ID,
    config.TELEGRAM_API_HASH,
    { connectionRetries: 2 },
  );
  let invalidCodeAttempts = 0;
  try {
    if (process.argv.includes('--qr')) {
      stdout.write(
        'Telefondagi shu hisobda Telegram > Settings > Devices > Link Desktop Device bo‘limini ochib QR kodni skanerlang.\n',
      );
      stdout.write('QR kodni hech kimga yubormang. U muddati tugaganda avtomatik yangilanadi.\n');
      await client.connect();
      await client.signInUserWithQrCode(
        { apiId: config.TELEGRAM_API_ID, apiHash: config.TELEGRAM_API_HASH },
        {
          qrCode: async ({ token }) => {
            qrCodeTerminal.generate(
              `tg://login?token=${token.toString('base64url')}`,
              { small: true },
              (qr) => {
                stdout.write(`${qr}\n`);
              },
            );
          },
          password: () => question('Telegram 2FA password: ', true),
          onError: (error) => {
            throw error;
          },
        },
      );
    } else {
      await client.start({
        phoneNumber: async () => (await question('Dedicated Telegram account phone: ')).trim(),
        phoneCode: async (_isCodeViaApp, initialInfo) => {
          let info = initialInfo;
          let sentAt = Date.now();
          while (true) {
            const destination =
              info?.type === 'app'
                ? 'shu raqam bilan ochilgan Telegram ilovasidagi rasmiy Telegram chatiga'
                : info?.type === 'sms' || info?.type === 'smsWord' || info?.type === 'smsPhrase'
                  ? 'SMS orqali'
                  : info?.type === 'call' ||
                      info?.type === 'flashCall' ||
                      info?.type === 'missedCall'
                    ? 'telefon qo‘ng‘irog‘i orqali'
                    : info?.type === 'fragment'
                      ? 'Fragment orqali'
                      : 'Telegram ko‘rsatgan usul orqali';
            stdout.write(`Tasdiqlash kodi ${destination} yuborilgan.\n`);
            if (info?.nextType) {
              stdout.write(
                `Kod kelmasa, Telegram ruxsat bergach boshqa usulda yuborish uchun "resend" deb yozing (${info.nextType}).\n`,
              );
            }
            const answer = (await question('Telegram login code: ', true)).trim();
            if (answer.toLowerCase() !== 'resend') return answer;
            if (!info?.nextType) {
              stdout.write('Telegram hozircha kodni boshqa usulda yuborishni taklif qilmagan.\n');
              continue;
            }
            const remainingSeconds = Math.ceil(
              ((info.timeout ?? 0) * 1000 - (Date.now() - sentAt)) / 1000,
            );
            if (remainingSeconds > 0) {
              stdout.write(`Kodni qayta so‘rash uchun yana ${remainingSeconds} soniya kuting.\n`);
              continue;
            }
            info = await info.resend();
            sentAt = Date.now();
          }
        },
        password: () => question('Telegram 2FA password: ', true),
        onError: (error) => {
          if ('errorMessage' in error && error.errorMessage === 'PHONE_CODE_INVALID') {
            invalidCodeAttempts += 1;
            if (invalidCodeAttempts < 3) {
              stdout.write(
                'Kod noto‘g‘ri. Shu urinish uchun kelgan eng yangi kodni qayta kiriting.\n',
              );
              return;
            }
            throw new Error(
              'Kod uch marta noto‘g‘ri kiritildi. Sozlashni qayta ishga tushirib, yangi koddan foydalaning.',
            );
          }
          throw error;
        },
      });
    }
    if (await client.isBot()) throw new Error('A dedicated user account is required');
    await mkdir(dirname(sessionFile), { recursive: true, mode: 0o700 });
    await writeFile(sessionFile, client.session.save(), { flag: 'wx', mode: 0o600 });
    stdout.write('Telegram discovery session saved. Keep this file private.\n');
  } finally {
    rl.close();
    await client.disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Telegram setup failed');
  process.exitCode = 1;
});
