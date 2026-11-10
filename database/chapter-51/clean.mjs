import { withVerifiedDatabase } from '../../scripts/verify-database.mjs';
import { AvatarObjects } from '../../dist/src/avatar-objects.js';
import { cleanAvatarBatch } from '../../dist/src/avatar-cleanup.js';

const [database, endpoint, bucket, attemptId, ...extra] = process.argv.slice(2);
if (!database || !endpoint || !bucket || extra.length) {
  throw Error('Usage: clean.mjs EXPECTED_DATABASE EXPECTED_ENDPOINT EXPECTED_BUCKET [ATTEMPT_ID]');
}
if (attemptId !== undefined && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(attemptId)) {
  throw Error('ATTEMPT_ID must be a lowercase UUID.');
}
if (endpoint !== process.env.AVATAR_S3_ENDPOINT || bucket !== process.env.AVATAR_S3_BUCKET) {
  throw Error('Storage endpoint or bucket differs from the expected destination.');
}
const objects = new AvatarObjects();
try {
  objects.ready();
  await withVerifiedDatabase(database, async client => {
    const { deleted, failed } = await cleanAvatarBatch(client, objects, attemptId);
    console.log('Deleted or already absent:', deleted, 'Failed:', failed);
    if (failed) process.exitCode = 1;
  });
} finally {
  objects.onModuleDestroy();
}
