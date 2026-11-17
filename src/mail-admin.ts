import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { z } from 'zod';
import { DatabaseService } from './database.service.js';
import { parseDatabaseConfig } from './database-config.js';
import { AppLogger } from './app-logger.js';
import { bindAttempt, releaseAddress } from './mail-delivery-facts.js';
import { scopeSchema } from './mail-receipt-config.js';
import { EmailSchema } from './recovery-contract.js';
const audit = {
  actor: z.string().min(1).max(100),
  reason: z.string().min(1).max(500),
};
const bind = z
  .object({
    ...audit,
    attemptId: z.string().uuid(),
    providerMessageId: z.string().uuid(),
    providerScope: scopeSchema,
    evidenceRef: z.string().min(1).max(200),
  })
  .strict();
const release = z
  .object({
    ...audit,
    id: z.string().uuid(),
    recipient: EmailSchema,
    expectedEpoch: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
  })
  .strict();
async function main() {
  const [expected, action, file, ...extra] = process.argv.slice(2);
  if (
    !expected ||
    !file ||
    !['bind', 'release'].includes(action ?? '') ||
    extra.length
  )
    throw Error();
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  let input: unknown;
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.size > 4096 ||
      stat.uid !== process.getuid?.()
    )
      throw Error();
    const buffer = Buffer.alloc(4097);
    const { bytesRead } = await handle.read(buffer, 0, 4097, 0);
    if (bytesRead > 4096) throw Error();
    input = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        buffer.subarray(0, bytesRead),
      ),
    );
  } finally {
    await handle.close();
  }
  const parsed = action === 'bind' ? bind.parse(input) : release.parse(input);
  const database = new DatabaseService(
    parseDatabaseConfig(process.env),
    new AppLogger('error'),
    'epp-mail-receipts',
  );
  try {
    const [row] = await database.client.$queryRaw<
      {
        name: string;
      }[]
    >`SELECT current_database() AS name`;
    if (row?.name !== expected) throw Error();
    await database.onModuleInit();
    console.log(
      JSON.stringify(
        action === 'bind'
          ? await bindAttempt(database, bind.parse(parsed))
          : await releaseAddress(database, release.parse(parsed)),
      ),
    );
  } finally {
    await database.onModuleDestroy();
  }
}
main().catch(() => {
  console.error('MAIL_ADMIN_FAILED');
  process.exitCode = 1;
});
