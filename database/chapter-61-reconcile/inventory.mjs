import { S3Client } from '@aws-sdk/client-s3';
import {
  observerConfig, integer, scanObjects, observeHead, writePrivate, safeError, demand,
} from './lib.mjs';
import { databaseConfig, scanDatabase, createDatabaseClient } from './db.mjs';

process.umask(0o077);
try {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'db') {
    demand(args.length >= 2 && args.length <= 3);
    const [expected, file, size] = args;
    const config = databaseConfig(expected, process.env.RECONCILE_DATABASE_URL);
    const result = await scanDatabase(createDatabaseClient(config), expected, integer(size, 100, 1000));
    await writePrivate(file, JSON.stringify(result, null, 2) + '\n');
    if (!result.complete) process.exitCode = 1;
  } else if (mode === 'objects' || mode === 'head') {
    demand(mode === 'objects' ? (args.length >= 4 && args.length <= 6) : args.length === 3);
    const [expectedEndpoint, expectedBucket] = args;
    const config = observerConfig(expectedEndpoint, expectedBucket);
    const source = { endpoint: config.endpoint, bucket: config.bucket, prefix: 'avatars/' };
    if (mode === 'objects') demand(args[2] === 'avatars/');
    const size = mode === 'objects' ? integer(args[4], 100, 1000) : 100;
    const max = mode === 'objects' ? integer(args[5], 10000, 10000) : 10000;
    const client = new S3Client({
      endpoint: config.endpoint, region: 'us-east-1', forcePathStyle: true, maxAttempts: 1,
      credentials: config.credentials, requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 },
    });
    try {
      if (mode === 'head') {
        const { ok, ...result } = await observeHead(client, source, args[2]);
        console.log(JSON.stringify(result));
        if (!ok) process.exitCode = 1;
      } else {
        const result = await scanObjects(client, source, size, max);
        await writePrivate(args[3], JSON.stringify(result, null, 2) + '\n');
        if (!result.complete) process.exitCode = 1;
      }
    } finally {
      client.destroy();
    }
  } else {
    throw { code: 'INVALID_INPUT' };
  }
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
}
