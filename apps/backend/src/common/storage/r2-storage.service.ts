import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../../config/app.config';

@Injectable()
export class R2Storage {
  private readonly config = getConfig();
  private readonly client: S3Client | null;
  readonly enabled: boolean;

  constructor() {
    this.enabled =
      this.config.NODE_ENV !== 'test' &&
      Boolean(
        this.config.R2_ACCOUNT_ID &&
        this.config.R2_ACCESS_KEY_ID &&
        this.config.R2_SECRET_ACCESS_KEY &&
        this.config.R2_BUCKET_NAME &&
        this.config.R2_ENDPOINT,
      );
    this.client = this.enabled
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
    try {
      await this.ready().send(
        new DeleteObjectCommand({ Bucket: this.config.R2_BUCKET_NAME, Key: key }),
      );
    } catch {
      throw new ServiceUnavailableException('Unable to delete the CV from R2. Please retry.');
    }
  }
}
