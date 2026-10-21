import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getConfig, isR2Configured } from '../../config/app.config';

export type StorageDriver = 'r2' | 'local';

/**
 * Private file storage for uploaded CVs. The class keeps its original name because
 * it is the injection token used across the backend; the backing store is chosen by
 * STORAGE_DRIVER: `local` (a directory on the server, backed by a Docker volume),
 * `r2` (Cloudflare R2) or `auto` (R2 when fully configured, otherwise disabled and the
 * CV bytes stay in the database as before). Object keys are identical for both drivers,
 * so files can be copied between them without touching the database.
 */
@Injectable()
export class R2Storage {
  private readonly config = getConfig();
  private readonly client: S3Client | null;
  private readonly localRoot: string | null;
  readonly driver: StorageDriver | null;
  readonly enabled: boolean;

  constructor() {
    const { STORAGE_DRIVER: requested, NODE_ENV } = this.config;
    let driver: StorageDriver | null = null;
    if (NODE_ENV !== 'test') {
      if (requested === 'local') driver = 'local';
      else if (requested === 'r2' || requested === 'auto') driver = isR2Configured(this.config) ? 'r2' : null;
    }
    this.driver = driver;
    this.enabled = driver !== null;
    this.localRoot = driver === 'local' ? resolve(this.config.LOCAL_STORAGE_DIR || 'uploads') : null;
    this.client =
      driver === 'r2'
        ? new S3Client({
            region: 'auto',
            endpoint: this.config.R2_ENDPOINT,
            credentials: {
              accessKeyId: this.config.R2_ACCESS_KEY_ID,
              secretAccessKey: this.config.R2_SECRET_ACCESS_KEY,
            },
          })
        : null;
  }

  private ready() {
    if (!this.client) throw new ServiceUnavailableException('R2 file storage is not configured');
    return this.client;
  }

  /** Resolves a key inside the storage root and refuses anything that would escape it. */
  private localPath(key: string) {
    const root = this.localRoot;
    if (!root) throw new ServiceUnavailableException('Local file storage is not configured');
    const target = resolve(root, key);
    if (!target.startsWith(root + sep)) throw new ServiceUnavailableException('Invalid storage key');
    return target;
  }

  async putResume(
    companyId: number,
    candidateId: number,
    originalName: string,
    contentType: string,
    body: Uint8Array,
  ) {
    const extension = extname(originalName)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 10);
    const key = `companies/${companyId}/candidates/${candidateId}/resumes/${randomUUID()}${extension}`;
    return this.putObject(key, contentType, body);
  }

  /** Stores an object under an exact key (used by putResume and by the R2 to local copy script). */
  async putObject(key: string, contentType: string, body: Uint8Array) {
    if (this.driver === 'local') {
      const target = this.localPath(key);
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        await writeFile(temporary, body, { flag: 'wx', mode: 0o600 });
        await rename(temporary, target);
        return key;
      } catch {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw new ServiceUnavailableException('Unable to store the CV on the server. Please retry.');
      }
    }
    try {
      await this.ready().send(
        new PutObjectCommand({
          Bucket: this.config.R2_BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'private, no-store',
        }),
      );
      return key;
    } catch {
      throw new ServiceUnavailableException('Unable to store the CV in R2. Please retry.');
    }
  }

  async get(key: string) {
    if (this.driver === 'local') {
      try {
        return new Uint8Array(await readFile(this.localPath(key)));
      } catch {
        throw new ServiceUnavailableException('Unable to read the CV from the server. Please retry.');
      }
    }
    try {
      const response = await this.ready().send(
        new GetObjectCommand({ Bucket: this.config.R2_BUCKET_NAME, Key: key }),
      );
      if (!response.Body) throw new Error('Empty R2 object');
      return await response.Body.transformToByteArray();
    } catch {
      throw new ServiceUnavailableException('Unable to download the CV from R2. Please retry.');
    }
  }

  async delete(key: string) {
    if (this.driver === 'local') {
      try {
        // Like S3, deleting a missing object is not an error.
        await rm(this.localPath(key), { force: true });
        return;
      } catch {
        throw new ServiceUnavailableException('Unable to delete the CV from the server. Please retry.');
      }
    }
    try {
      await this.ready().send(
        new DeleteObjectCommand({ Bucket: this.config.R2_BUCKET_NAME, Key: key }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
    } catch {
      throw new ServiceUnavailableException('Unable to delete the CV from R2. Please retry.');
    }
  }
}
