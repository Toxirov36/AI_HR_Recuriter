import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetConfigCache } from '../../config/app.config';
import { R2Storage } from './r2-storage.service';

const original = { ...process.env };
let directory: string;

function storage(overrides: Record<string, string> = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'x'.repeat(40),
    STORAGE_DRIVER: 'local',
    LOCAL_STORAGE_DIR: directory,
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET_NAME: '',
    R2_ENDPOINT: '',
    ...overrides,
  });
  resetConfigCache();
  return new R2Storage();
}

describe('local CV storage', () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cv-storage-'));
  });

  afterEach(async () => {
    process.env = { ...original };
    resetConfigCache();
    await rm(directory, { recursive: true, force: true });
  });

  it('stores, reads and deletes a CV on disk using the same key layout as R2', async () => {
    const files = storage();
    expect(files.enabled).toBe(true);
    expect(files.driver).toBe('local');

    const key = await files.putResume(3, 7, 'Resume.PDF', 'application/pdf', new Uint8Array([1, 2, 3]));
    expect(key).toMatch(/^companies\/3\/candidates\/7\/resumes\/[0-9a-f-]{36}\.pdf$/);
    expect(Array.from(await files.get(key))).toEqual([1, 2, 3]);
    expect((await stat(join(directory, key))).mode & 0o777).toBe(process.platform === 'win32' ? 0o666 : 0o600);

    await files.delete(key);
    expect(existsSync(join(directory, key))).toBe(false);
    await expect(files.delete(key)).resolves.toBeUndefined();
    await expect(files.get(key)).rejects.toThrow('Unable to read the CV');
  });

  it('leaves no temporary files behind', async () => {
    const files = storage();
    const key = await files.putResume(1, 1, 'cv.docx', 'application/octet-stream', new Uint8Array([9]));
    const folder = join(directory, key, '..');
    expect(await readdir(folder)).toHaveLength(1);
    expect(await readFile(join(directory, key))).toHaveLength(1);
  });

  it('refuses keys that escape the storage directory', async () => {
    const files = storage();
    await expect(files.get('../../etc/passwd')).rejects.toThrow();
    await expect(files.delete('companies/../../outside.txt')).rejects.toThrow();
    await expect(files.putObject('../escape.pdf', 'application/pdf', new Uint8Array([1]))).rejects.toThrow();
  });

  it('is disabled with the auto driver when R2 is not configured, and in tests', () => {
    expect(storage({ STORAGE_DRIVER: 'auto' }).enabled).toBe(false);
    expect(storage({ NODE_ENV: 'test' }).enabled).toBe(false);
  });

  it('rejects STORAGE_DRIVER=r2 without the R2 settings', () => {
    expect(() => storage({ STORAGE_DRIVER: 'r2' })).toThrow('STORAGE_DRIVER=r2');
  });
});
