import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('../.env', import.meta.url);
const dbPassword = randomBytes(24).toString('hex');
const redisPassword = randomBytes(24).toString('hex');
let text = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
text = text
  .replace(/^POSTGRES_PASSWORD=$/m, `POSTGRES_PASSWORD=${dbPassword}`)
  .replace(/^REDIS_PASSWORD=$/m, `REDIS_PASSWORD=${redisPassword}`)
  .replace(/^JWT_SECRET=$/m, `JWT_SECRET=${randomBytes(48).toString('hex')}`)
  .replace('recruiter:YOUR_URL_ENCODED_PASSWORD', `recruiter:${dbPassword}`)
  .replace('redis://:YOUR_URL_ENCODED_PASSWORD', `redis://:${redisPassword}`);
try {
  await writeFile(file, text, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored .env with generated local secrets. GEMINI_API_KEY is blank.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env already exists; nothing was changed.');
  else throw error;
}
