import pg from 'pg';
import { demand, integer, now, safeError } from './lib.mjs';

export function databaseConfig(expected, value) {
  const url = URL.parse(value ?? '');
  demand(url && ['postgresql:', 'postgres:'].includes(url.protocol) && expected);
  demand(decodeURIComponent(url.pathname.slice(1)) === expected && url.hostname);
  return {
    connectionString: value, connectionTimeoutMillis: 5000,
    query_timeout: 16000, application_name: 'chapter61-readonly',
  };
}

export async function scanDatabase(client, expected, pageSize = 100, maxPages = 10000, maxRows = 1000000) {
  integer(pageSize, 100, 1000);
  const manifest = {
    format: 'epp-avatar-db/v1', source: null, startedAt: now(), endedAt: null,
    databaseClock: null, complete: false, terminal: { users: false, attempts: false },
    pages: { users: [], attempts: [] }, users: [], attempts: [], error: null,
  };
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='20s'");
    const { rows: [identity] } = await client.query(`
      SELECT current_database() AS database, current_user AS role,
        inet_server_addr()::text AS host, inet_server_port() AS port,
        clock_timestamp() AS clock
    `);
    demand(identity.database === expected);
    manifest.source = {
      host: identity.host ?? 'local-socket', port: identity.port ?? 5432,
      database: identity.database, role: identity.role,
    };
    manifest.databaseClock = new Date(identity.clock).toISOString();

    // Table and column names are fixed here, never taken from CLI input.
    for (const [kind, table, columns] of [
      ['users', 'users', 'id, avatar_id'],
      ['attempts', 'avatar_writes', 'id, user_id, state, created_at, check_after'],
    ]) {
      let after = null;
      for (let number = 1; number <= maxPages; number++) {
        const startedAt = now();
        const { rows } = await client.query(`
          SELECT ${columns} FROM public.${table}
          WHERE ($1::uuid IS NULL OR id > $1::uuid) ORDER BY id LIMIT $2
        `, [after, pageSize]);
        manifest[kind].push(...rows);
        manifest.pages[kind].push({
          number, startedAt, endedAt: now(), count: rows.length,
          terminal: rows.length < pageSize,
        });
        manifest.terminal[kind] = rows.length < pageSize;
        if (manifest.users.length + manifest.attempts.length > maxRows) throw { code: 'ROW_LIMIT' };
        if (manifest.terminal[kind]) {
          break;
        }
        after = rows.at(-1).id;
      }
      if (!manifest.terminal[kind]) throw { code: 'PAGE_LIMIT' };
    }
    await client.query('COMMIT');
    manifest.complete = true;
  } catch (error) {
    manifest.error = safeError(error);
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection may never have opened.
    }
  } finally {
    try {
      await client.end();
    } catch {
      // Retain the original observation failure if closing also fails.
    }
    manifest.endedAt = now();
  }
  return manifest;
}

export const createDatabaseClient = config => new pg.Client(config);
