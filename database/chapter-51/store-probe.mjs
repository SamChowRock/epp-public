import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import {
  CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand,
  ListBucketsCommand, ListObjectsV2Command, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const mode = process.argv[2];
if (!['buckets', 'write', 'resume', 'reset-probe'].includes(mode)) throw Error('Use buckets, write, resume or reset-probe');
const directory = '.chapter51-store';
const state = directory + '/probe.json';
const identity = mode === 'buckets' ? 'admin' : 'app';
const settings = parseEnv(await readFile(directory + '/' + identity + '.env', 'utf8'));
const endpoint = settings.AVATAR_S3_ENDPOINT;
const Bucket = settings.AVATAR_S3_BUCKET;
assert.equal(endpoint, 'http://127.0.0.1:18633');
assert.equal(Bucket, 'avatars');
const other = 'chapter51-private-control';
const client = new S3Client({
  endpoint, region: 'us-east-1', forcePathStyle: true, maxAttempts: 1,
  credentials: { accessKeyId: settings.AVATAR_S3_ACCESS_KEY, secretAccessKey: settings.AVATAR_S3_SECRET_KEY },
});
const send = command => client.send(command, { abortSignal: AbortSignal.timeout(15_000) });
const denied = error => error.$metadata?.httpStatusCode === 403 && error.name === 'AccessDenied';
const missing = error => error.$metadata?.httpStatusCode === 404 && error.name === 'NoSuchKey';
async function read(object) {
  const response = await send(new GetObjectCommand(object));
  return Buffer.from(await response.Body.transformToByteArray());
}
async function exercise() {
  if (mode === 'buckets') {
    const { Buckets } = await send(new ListBucketsCommand({}));
    for (const name of [Bucket, other]) {
      if (!Buckets.some(bucket => bucket.Name === name)) await send(new CreateBucketCommand({ Bucket: name }));
    }
    console.log('Ready: avatars and chapter51-private-control');
    return;
  }

  const id = mode === 'write' ? randomUUID() : JSON.parse(await readFile(state, 'utf8')).id;
  assert.match(id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  const object = { Bucket, Key: 'probe/' + id };
  const sibling = { Bucket, Key: object.Key + '-sibling' };
  if (mode === 'reset-probe') {
    for (const item of [object, sibling]) {
      await send(new DeleteObjectCommand(item));
      await assert.rejects(read(item), missing);
    }
    await unlink(state);
    console.log('Removed the two recorded probe keys.');
    return;
  }
  const bytes = Buffer.from('chapter 51 / ' + id);
  if (mode === 'write') {
    await writeFile(state, JSON.stringify({ id }), { mode: 0o600, flag: 'wx' });
    for (const item of [object, sibling]) {
      await send(new PutObjectCommand({ ...item, Body: bytes, ContentType: 'application/octet-stream' }));
    }
  }
  const head = await send(new HeadObjectCommand(object));
  assert.equal(head.ContentLength, bytes.length);
  assert.equal(head.ContentType, 'application/octet-stream');
  assert.deepEqual(await read(object), bytes);
  const fetchLocal = url => fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
  const anonymous = await fetchLocal(endpoint + '/' + Bucket + '/' + object.Key);
  assert.equal(anonymous.status, 403);
  await anonymous.body.cancel();
  await assert.rejects(send(new ListObjectsV2Command({ Bucket })), denied);
  await assert.rejects(send(new PutObjectCommand({ ...object, Bucket: other, Body: bytes })), denied);
  console.log('HEAD and GET matched; anonymous GET, bucket list and cross-bucket PUT returned 403');
  const url = await getSignedUrl(client, new GetObjectCommand(object), { expiresIn: 2 });
  const fresh = await fetchLocal(url);
  assert.equal(fresh.status, 200);
  assert.deepEqual(Buffer.from(await fresh.arrayBuffer()), bytes);
  await delay(3500);
  const expired = await fetchLocal(url);
  assert.equal(expired.status, 403);
  await expired.body.cancel();
  console.log('Same signed GET: 200, then 403 after 3.5 seconds');
  if (mode === 'resume') {
    await send(new DeleteObjectCommand(object));
    await assert.rejects(read(object), missing);
    assert.deepEqual(await read(sibling), bytes);
    await send(new DeleteObjectCommand(sibling));
    await assert.rejects(read(sibling), missing);
    await unlink(state);
    console.log('Restart preserved both keys. Exact DELETE: 404, sibling bytes intact; sibling then removed.');
  }
}
try {
  await exercise();
} catch (error) {
  // Exceptions from Fetch and SDKs can contain a signed request. Report only the classification.
  console.error('Storage probe failed:', error.name, error.code ?? '', error.$metadata?.httpStatusCode ?? '');
  process.exitCode = 1;
} finally {
  client.destroy();
}
