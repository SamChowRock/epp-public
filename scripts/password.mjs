import { DatabaseService } from '../dist/src/database.service.js';
import { parseDatabaseConfig } from '../dist/src/database-config.js';
import { AppLogger } from '../dist/src/app-logger.js';
import { initializeDevelopmentPassword, verifyDevelopmentPassword } from '../dist/src/password-credential.js';

let db;
try {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !['init', 'verify'].includes(mode) || process.stdin.isTTY) {
    throw new Error('PASSWORD_COMMAND_INVALID');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1024) throw new Error('PASSWORD_INPUT_INVALID');
    chunks.push(chunk);
  }
  const password = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
  const config = parseDatabaseConfig(process.env);
  if (config.queryDebug) throw new Error('PASSWORD_QUERY_DEBUG_FORBIDDEN');
  db = new DatabaseService(config, new AppLogger('error'));
  await db.onModuleInit();
  if (mode === 'init') {
    await initializeDevelopmentPassword(db.client, password);
    console.log('PASSWORD_CREATED');
  } else {
    const valid = await verifyDevelopmentPassword(db.client, password);
    console.log(valid ? 'PASSWORD_MATCH' : 'PASSWORD_NO_MATCH');
    if (!valid) process.exitCode = 1;
  }
} catch (error) {
  const allowed = new Set(['PASSWORD_COMMAND_INVALID', 'PASSWORD_INPUT_INVALID',
    'PASSWORD_QUERY_DEBUG_FORBIDDEN', 'PASSWORD_RECORD_INVALID', 'PASSWORD_BLOCKLISTED']);
  console.error(error?.code === 'P2002' ? 'PASSWORD_ALREADY_EXISTS'
    : allowed.has(error?.message) ? error.message : 'PASSWORD_OPERATION_FAILED');
  process.exitCode = 1;
} finally {
  try { await db?.onModuleDestroy(); }
  catch { console.error('PASSWORD_CLOSE_FAILED'); process.exitCode = 1; }
}
