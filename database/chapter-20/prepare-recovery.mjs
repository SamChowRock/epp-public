import { mkdir, copyFile, readdir } from 'node:fs/promises';
const source = new URL('../../prisma/migrations/', import.meta.url);
const target = new URL('./recovery-history/', import.meta.url);
const mode = process.argv[2];
if (!['baseline', 'append'].includes(mode)) throw new Error('Use baseline or append');
// Never remove existing history. Duplicate setup fails rather than resetting data.
if (mode === 'baseline') {
  await mkdir(target);
  await copyFile(new URL('migration_lock.toml', source), new URL('migration_lock.toml', target));
}
const names = (await readdir(source, { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && (mode === 'baseline' ? entry.name === '0_init' : entry.name !== '0_init'))
  .map(entry => entry.name);
for (const name of names) {
  await mkdir(new URL(name + '/', target));
  await copyFile(new URL(name + '/migration.sql', source), new URL(name + '/migration.sql', target));
}
console.log(`Prepared ${mode} migration copies; no database was changed.`);
