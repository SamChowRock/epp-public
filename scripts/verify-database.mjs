import pg from 'pg';

// Verify the effective process configuration, before any migration or lab write.
export async function withVerifiedDatabase(expected, inspect = async () => {}) {
  if (!expected?.trim()) throw Error('Pass the expected database name as a separate argument.');
  const url = URL.parse(process.env.DATABASE_URL);
  if (!url || !['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname
    || !url.username || url.pathname.length < 2 || url.hash
    || [...url.searchParams].some(([key, value]) => key !== 'schema' || value !== 'public')
    || url.searchParams.size > 1) {
    throw Error('Expected an explicit PostgreSQL DATABASE_URL for the public schema.');
  }
  url.search = '';
  const client = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
  try {
    let actual;
    try {
      await client.connect();
      const result = await client.query('SELECT current_database() AS name');
      actual = result.rows[0].name;
    } catch {
      throw Error('Cannot verify current_database(); check the database connection.');
    }
    if (actual !== expected) throw Error('Database name differs from the expected name. Stopping.');
    console.log('Verified database:', actual);
    await inspect(client);
  } finally {
    await client.end();
  }
}
