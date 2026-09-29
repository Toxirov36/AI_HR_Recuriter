import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { encrypt, decrypt } from './crypto.mjs';

process.umask(0o077);
const base = process.env.HR_BASE || '/home/dilshodbektohirov40/hr-recruiter';
dotenv.config({ path: join(base, '.env'), quiet: true });
const env = process.env;
const dir = join(base, 'backups', 'daily');
const state = join(base, 'ops-state');
mkdirSync(dir, { recursive: true }); mkdirSync(state, { recursive: true });
const run = (args, options = {}) => execFileSync('docker', args, {
  timeout: 180000, maxBuffer: 256 * 1024 * 1024, ...options,
});
const prefix = 'database-backups/hr-recruiter/';
const stamp = new Date().toISOString().replaceAll(':', '-');
const key = prefix + stamp + '.dump.enc';
const client = new S3Client({ region: 'auto', endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  requestHandler: { requestTimeout: 120000, connectionTimeout: 10000 }, maxAttempts: 3 });
const Bucket = env.R2_BUCKET_NAME;
let testContainer;
try {
  const encryptionKey = readFileSync(join(base, 'backup-encryption.key'));
  if (encryptionKey.length !== 32) throw new Error('Backup key must be 32 bytes');
  const dump = run(['exec', 'ai-hr-recruiter-postgres-1', 'pg_dump', '-U', env.POSTGRES_USER || 'recruiter',
    '-d', env.POSTGRES_DB || 'recruiter', '-Fc']);
  if (!dump.subarray(0, 5).equals(Buffer.from('PGDMP'))) throw new Error('Invalid database dump');
  const encrypted = encrypt(dump, encryptionKey);
  const sha256 = createHash('sha256').update(encrypted).digest('hex');
  await client.send(new PutObjectCommand({ Bucket, Key: key, Body: encrypted,
    ContentType: 'application/octet-stream', Metadata: { sha256 } }));
  const object = await client.send(new GetObjectCommand({ Bucket, Key: key }));
  const downloaded = Buffer.from(await object.Body.transformToByteArray());
  if (createHash('sha256').update(downloaded).digest('hex') !== sha256) throw new Error('R2 verification failed');
  const restored = decrypt(downloaded, encryptionKey);
  // Isolated, temporary PostgreSQL instance; no production volume or network access.
  testContainer = `hr-backup-restore-${process.pid}`;
  run(['run', '-d', '--name', testContainer, '--network', 'none', '--memory', '384m', '--cpus', '0.5',
    '--tmpfs', '/var/lib/postgresql/data:rw,size=256m', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try { run(['exec', testContainer, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' }); ready = true; break; }
    catch { await sleep(1000); }
  }
  if (!ready) throw new Error('Restore test database did not start');
  run(['exec', '-i', testContainer, 'pg_restore', '-U', 'postgres', '-d', 'postgres',
    '--exit-on-error', '--no-owner', '--no-privileges'], { input: restored });
  const tables = Number(run(['exec', testContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"]).toString().trim());
  if (tables < 1) throw new Error('Restored database has no tables');
  writeFileSync(join(dir, stamp + '.dump.enc'), encrypted, { mode: 0o600 });
  const report = { lastSuccess: new Date().toISOString(), key, sha256, bytes: encrypted.length, restoreVerified: true, tables };
  writeFileSync(join(state, 'backup.json.tmp'), JSON.stringify(report));
  renameSync(join(state, 'backup.json.tmp'), join(state, 'backup.json'));
  console.log(`Encrypted backup uploaded, downloaded and restored successfully (${tables} tables).`);
  // Prune only this backup prefix, after a verified new backup; keep 30 days remotely, 7 locally.
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }));
    for (const item of page.Contents || []) {
      if (item.Key !== key && /^database-backups\/hr-recruiter\/\d{4}-\d{2}-\d{2}T[\d.-]+Z\.dump\.enc$/.test(item.Key) &&
          item.LastModified.getTime() < Date.now() - 30 * 86400000) {
        await client.send(new DeleteObjectCommand({ Bucket, Key: item.Key }));
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  for (const name of readdirSync(dir)) {
    if (/^\d{4}-\d{2}-\d{2}T[\d.-]+Z\.dump\.enc$/.test(name) && statSync(join(dir, name)).mtimeMs < Date.now() - 7 * 86400000) unlinkSync(join(dir, name));
  }
} catch (error) {
  // Do not log SDK request objects, SMTP credentials or database contents.
  console.error(`Backup failed (${error.name || 'Error'}); inspect the service and R2 access.`);
  process.exitCode = 1;
} finally {
  if (testContainer) { try { run(['rm', '-f', testContainer], { stdio: 'ignore' }); } catch {} }
  client.destroy();
}
