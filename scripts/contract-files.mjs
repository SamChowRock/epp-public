import { mkdir, readFile, writeFile } from 'node:fs/promises';

const mode = process.argv[2];
if (!['check', 'update'].includes(mode) || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/contract-files.mjs check|update');
}
if (mode === 'update') await mkdir('docs/generated', { recursive: true });
for (const name of ['ERD.md', 'openapi.json']) {
  const snapshot = 'docs/generated/' + name;
  const built = await readFile('dist/' + name);
  if (mode === 'update') {
    await writeFile(snapshot, built);
    console.log('Updated', snapshot);
    continue;
  }
  let saved;
  try {
    saved = await readFile(snapshot);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!saved?.equals(built)) {
    console.error('Missing or stale snapshot:', snapshot);
    process.exitCode = 1;
  } else {
    console.log('Matches', snapshot);
  }
}
