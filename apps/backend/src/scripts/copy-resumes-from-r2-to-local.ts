/**
 * Copies every CV object referenced by the database from Cloudflare R2 to the local
 * storage directory. Object keys are identical in both drivers, so the database is not
 * modified and the copy can be repeated safely (existing local files are skipped).
 *
 * Needs the five R2_* variables (source) and LOCAL_STORAGE_DIR (destination):
 *   npm run storage:copy-from-r2 -w apps/backend             # copy
 *   npm run storage:copy-from-r2 -w apps/backend -- --dry-run # only count
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Database } from '../database/prisma.service';
import { R2Storage } from '../common/storage/r2-storage.service';
import { resetConfigCache } from '../config/app.config';

function storageFor(driver: 'r2' | 'local') {
  process.env.STORAGE_DRIVER = driver;
  resetConfigCache();
  return new R2Storage();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const source = storageFor('r2');
  if (!source.enabled) throw new Error('R2 is not configured: set all five R2_* variables');
  const destination = storageFor('local');
  const localDir = resolve(process.env.LOCAL_STORAGE_DIR || 'uploads');

  const db = new Database();
  await db.$connect();
  let copied = 0;
  let skipped = 0;
  let failed = 0;
  try {
    const entries = new Map<string, string>();
    const candidates = await db.candidate.findMany({
      where: { resumeObjectKey: { not: null } },
      select: { resumeObjectKey: true, resumeMime: true },
    });
    for (const row of candidates) {
      if (row.resumeObjectKey) entries.set(row.resumeObjectKey, row.resumeMime ?? 'application/octet-stream');
    }
    const resumes = await db.resume.findMany({
      where: { objectKey: { not: null } },
      select: { objectKey: true, mimeType: true },
    });
    for (const row of resumes) {
      if (row.objectKey && !entries.has(row.objectKey)) {
        entries.set(row.objectKey, row.mimeType ?? 'application/octet-stream');
      }
    }

    for (const [key, mime] of entries) {
      if (existsSync(join(localDir, key))) {
        skipped++;
        continue;
      }
      if (dryRun) {
        copied++;
        continue;
      }
      try {
        await destination.putObject(key, mime, await source.get(key));
        copied++;
      } catch (error) {
        failed++;
        console.error(`Failed to copy ${key}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    console.log(
      `${dryRun ? 'Dry run: ' : ''}${copied} file(s) ${dryRun ? 'would be copied' : 'copied'}, ${skipped} already present, ${failed} failed.`,
    );
    if (failed) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Copy from R2 failed');
  process.exitCode = 1;
});
