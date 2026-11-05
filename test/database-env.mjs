const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl?.trim()) {
  throw new Error('TEST_DATABASE_URL is required; use an isolated, migrated verification database.');
}
// Never fall back to the application's development connection.
process.env.DATABASE_URL = testUrl;
