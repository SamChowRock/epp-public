import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { AvatarObjects } from '../../dist/src/avatar-objects.js';

const [id, ...extra] = process.argv.slice(2);
if (extra.length || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id ?? '')) {
  throw Error('Pass one avatar attempt UUID copied from the practice database');
}
const objects = new AvatarObjects();
try {
  const { client, bucket } = objects.ready();
  const result = await client.send(new HeadObjectCommand({
    Bucket: bucket, Key: 'avatars/' + id + '.webp',
  }), { abortSignal: AbortSignal.timeout(5000) });
  console.log('Present', id, result.ContentType, result.ContentLength, 'bytes');
} catch (error) {
  // HEAD may hide existence from an identity without access. Only this private lab
  // has verified the behavior of a missing key under the configured app identity.
  if (error?.$metadata?.httpStatusCode === 404) console.log('Not found for this target', id);
  else { console.error('Could not verify object', error?.$metadata?.httpStatusCode ?? 'no HTTP status'); process.exitCode = 1; }
} finally { objects.onModuleDestroy(); }
