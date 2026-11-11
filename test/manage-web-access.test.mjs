import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AppLogger } from '../dist/src/app-logger.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { parseDatabaseConfig } from '../dist/src/database-config.js';
import { ManageWebAccess } from '../dist/src/manage-web-access.js';

test('concurrent copies share a receipt and replay preserves a later decision', async () => {
  const db = new DatabaseService(parseDatabaseConfig(process.env), new AppLogger('error'), 'epp-admin');
  const service = new ManageWebAccess(db);
  const expected = decodeURIComponent(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1));
  const userId = randomUUID();
  const grant = { kind: 'apply', enabled: true, operationId: randomUUID() };
  try {
    await db.client.user.create({ data: { id: userId } });
    const run = action => service.run(expected, userId, action);
    await assert.rejects(service.run(expected + '-wrong', userId, grant), /Database name mismatch/);
    const { after } = await run({ kind: 'preview', enabled: true });
    assert.equal(after.webEnabled, true);
    assert.equal((await db.client.user.findUniqueOrThrow({ where: { id: userId } })).webEnabled, false);
    const pair = await Promise.all([run(grant), run(grant)]);
    assert.deepEqual(pair.map(r => r.result).sort(), ['applied', 'replayed']);
    assert.deepEqual(pair[0].receipt, pair[1].receipt);
    await assert.rejects(run({ ...grant, enabled: false }), /Operation ID conflict/);
    await run({ ...grant, operationId: randomUUID(), enabled: false });
    assert.deepEqual((await run(grant)).receipt, pair[0].receipt);
    assert.equal((await db.client.user.findUniqueOrThrow({ where: { id: userId } })).webEnabled, false);
    assert.equal(await db.client.webAccessReceipt.count({ where: { userId } }), 2);
  } finally {
    try {
      await db.client.webAccessReceipt.deleteMany({ where: { userId } });
      await db.client.user.deleteMany({ where: { id: userId } });
    } finally { await db.onModuleDestroy(); }
  }
});
