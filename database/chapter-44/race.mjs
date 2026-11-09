// Run against an isolated localhost mail sink; see README.md. No HTTP listener.
import { createInterface } from 'node:readline/promises';
import { parseDatabaseConfig } from '../../dist/src/database-config.js';
import { DatabaseService } from '../../dist/src/database.service.js';
import { AppLogger } from '../../dist/src/app-logger.js';
import { mailPortSchema } from '../../dist/src/config.js';
import { LocalMailDelivery } from '../../dist/src/verification-delivery.js';
import { claimOne } from '../../dist/src/verification-claim.js';
import { deliverClaim } from '../../dist/src/verification-outbox.js';

const [expected, id, mode, ...extra] = process.argv.slice(2);
if (!expected || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id ?? '') ||
    !['before','after','now'].includes(mode) || extra.length)
  throw Error('Usage: race.mjs EXPECTED_DATABASE MESSAGE_UUID before|after|now');
const db = new DatabaseService(parseDatabaseConfig(process.env), new AppLogger('warn'), 'epp-worker');
const smtp = new LocalMailDelivery({ localSmtpPort: mailPortSchema.parse(process.env.LOCAL_SMTP_PORT) });
async function pause(label) {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try { await input.question(label + ' — press Enter to continue\n'); }
  finally { input.close(); }
}
try {
  const [row] = await db.client.$queryRaw`SELECT current_database() AS name`;
  if (row.name !== expected) throw Error('DATABASE_MISMATCH');
  const claim = await claimOne(db, id);
  if (typeof claim === 'string') console.log(claim);
  else {
    console.log('reserved', claim.id);
    if (mode === 'before') await pause('claimed, before preparation');
    const result = await deliverClaim(db, { async send(...args) {
      await smtp.send(...args);
      if (mode === 'after') await pause('SMTP accepted, before database writeback');
    } }, claim);
    console.log(result);
  }
} finally { await db.onModuleDestroy(); }
