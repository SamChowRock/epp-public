import { spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { withVerifiedDatabase } from './verify-database.mjs';

// Existing migration names are part of each database's Prisma history.
const baseline = [
  '0_init',
  '20261102040511_add_chinese_intent',
  '20261102061033_widen_chinese_intent',
  '20261102100000_capture_revisions',
  '20261103090000_candidates',
  '20261103140000_acceptance',
  '20261104090000_single_acceptance',
  '20261104120000_command_receipts',
  '20261104160000_expression_identity',
  '20261105090000_learning_feed_index',
  '20261106090000_password_credentials',
  '20261106100000_sessions',
  '20261106110000_account_access',
];
const [mode, expected, ...extra] = process.argv.slice(2);
if (!['bootstrap', 'deploy'].includes(mode) || extra.length) {
  throw Error('Usage: node scripts/deploy-verify.mjs <bootstrap|deploy> <expected database>');
}
await withVerifiedDatabase(expected, async client => {
  if (mode === 'bootstrap') {
    const { rows } = await client.query(`
      SELECT EXISTS (SELECT FROM pg_class WHERE relnamespace = 'public'::regnamespace
        UNION ALL SELECT FROM pg_type WHERE typnamespace = 'public'::regnamespace
        UNION ALL SELECT FROM pg_proc WHERE pronamespace = 'public'::regnamespace) AS occupied`);
    if (rows[0].occupied) throw Error('Bootstrap requires an empty public schema.');
  } else {
    const history = await client.query("SELECT to_regclass('public._prisma_migrations') AS name");
    if (!history.rows[0].name) throw Error('Missing migration history; bootstrap a fresh database.');
    const { rows } = await client.query(
      'SELECT migration_name, finished_at FROM public._prisma_migrations WHERE rolled_back_at IS NULL');
    const applied = new Set(rows.filter(row => row.finished_at).map(row => row.migration_name));
    if (rows.some(row => !row.finished_at) || !baseline.every(name => applied.has(name))) {
      throw Error('Incomplete baseline or failed migration; inspect migration status before proceeding.');
    }
  }
});

function deploy(config) {
  const result = spawnSync(process.execPath, [
    resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', config,
  ], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw Error('Prisma migrate deploy failed.');
}

if (mode === 'bootstrap') {
  const stage = await mkdtemp(join(tmpdir(), 'epp-migrations-'));
  try {
    const migrations = join(stage, 'migrations');
    await mkdir(migrations);
    await copyFile('prisma/migrations/migration_lock.toml', join(migrations, 'migration_lock.toml'));
    for (const name of baseline) {
      await cp(join('prisma/migrations', name), join(migrations, name), { recursive: true });
    }
    await copyFile('prisma/schema.prisma', join(stage, 'schema.prisma'));
    const config = join(stage, 'prisma.config.ts');
    await writeFile(config, `export default {
      schema: './schema.prisma', migrations: { path: './migrations' },
      datasource: { url: process.env.DATABASE_URL }
    };`);
    deploy(config);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
deploy(resolve('prisma.config.ts'));
