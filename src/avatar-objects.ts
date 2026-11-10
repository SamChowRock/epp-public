import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpError } from './http.js';

@Injectable()
export class AvatarObjects implements OnModuleDestroy {
  private readonly store?: { client: S3Client; bucket: string };

  constructor() {
    const {
      AVATAR_S3_ENDPOINT: endpoint, AVATAR_S3_BUCKET: bucket,
      AVATAR_S3_ACCESS_KEY: accessKeyId, AVATAR_S3_SECRET_KEY: secretAccessKey,
    } = process.env;
    if ([endpoint, bucket, accessKeyId, secretAccessKey].every(value => value === undefined)) return;
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('Incomplete avatar storage configuration');
    }
    const url = URL.parse(endpoint);
    if (!url) throw new Error('Invalid avatar storage endpoint');
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (endpoint !== url.origin || (!localHttp && url.protocol !== 'https:')) {
      throw new Error('Invalid avatar storage endpoint');
    }
    const client = new S3Client({
      endpoint, region: 'us-east-1', forcePathStyle: true, maxAttempts: 1,
      credentials: { accessKeyId, secretAccessKey },
    });
    this.store = { client, bucket };
  }

  ready() {
    if (!this.store) throw new HttpError(503, 'Avatar storage unavailable', 'AVATAR_STORAGE_UNAVAILABLE');
    return this.store;
  }

  private object(bucket: string, id: string) {
    return { Bucket: bucket, Key: 'avatars/' + id + '.webp' };
  }

  async put(id: string, bytes: Buffer) {
    const { client, bucket } = this.ready();
    await client.send(new PutObjectCommand({
      ...this.object(bucket, id), Body: bytes, ContentType: 'image/webp', CacheControl: 'private, no-store',
    }), { abortSignal: AbortSignal.timeout(15_000) });
  }

  async url(id: string, signingDate: Date) {
    const { client, bucket } = this.ready();
    return getSignedUrl(client, new GetObjectCommand(this.object(bucket, id)), { expiresIn: 30, signingDate });
  }

  async remove(id: string) {
    const { client, bucket } = this.ready();
    await client.send(new DeleteObjectCommand(this.object(bucket, id)), { abortSignal: AbortSignal.timeout(15_000) });
  }

  onModuleDestroy() {
    this.store?.client.destroy();
  }
}
