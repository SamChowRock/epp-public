import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('database tests require an explicit test connection before opening the application', () => {
  for (const value of [undefined, '', '   ']) {
    const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: 'postgresql://unused@127.0.0.1:1/development' };
    delete env.NODE_TEST_CONTEXT;
    delete env.TEST_DATABASE_URL;
    if (value !== undefined) env.TEST_DATABASE_URL = value;
    const result = spawnSync(process.execPath, ['--test', 'test/captures.test.mjs'], {
      env, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /TEST_DATABASE_URL is required/);
    assert.doesNotMatch(result.stdout + result.stderr, /database\.start_failed/);
  }
});

test('the explicit test connection replaces an inherited application connection', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "await import('./test/database-env.mjs'); console.log(process.env.DATABASE_URL)"], {
    env: { ...process.env, DATABASE_URL: 'postgresql://unused@127.0.0.1:1/development',
      TEST_DATABASE_URL: 'postgresql://unused@127.0.0.1:1/verification' },
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'postgresql://unused@127.0.0.1:1/verification');
});
