// Run against VERIFY: node --env-file=.env.test database/chapter-30/04-pool.mjs
import pg from 'pg';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set TEST_DATABASE_URL to the verification database');
const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 2000 });
try {
  const held = await pool.connect();
  let second;
  try {
    second = pool.query('SELECT 1 AS value');
    console.log({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount });
  } finally {
    held.release();
  }
  console.log({ result: (await second).rows[0].value, waiting: pool.waitingCount });
} finally {
  await pool.end();
}
