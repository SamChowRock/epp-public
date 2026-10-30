export function readHttpOptions(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(mode)) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  const rawDocs = env.DOCS_ENABLED;
  if (rawDocs !== undefined && rawDocs !== 'true' && rawDocs !== 'false') {
    throw new Error('DOCS_ENABLED must be true or false');
  }
  return { docsEnabled: rawDocs === undefined ? mode === 'development' : rawDocs === 'true' };
}
