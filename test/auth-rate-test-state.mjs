import './database-env.mjs';
const testUrl = process.env.TEST_DATABASE_URL;
// Each top-level scenario owns its quota state in this explicitly isolated test DB.
// Never reset between apps inside a scenario: multi-instance tests rely on persistence.
import { beforeEach, afterEach } from 'node:test';
import pg from 'pg';
async function resetAuthRate() {
  const client = new pg.Client({ connectionString: testUrl });
  try { await client.connect(); await client.query("DELETE FROM public.auth_rate_buckets WHERE rule_key = 'password-auth/v1'"); }
  finally { await client.end(); }
}
beforeEach(resetAuthRate); afterEach(resetAuthRate);
