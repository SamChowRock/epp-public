import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'epp-handle-'));
const filename = join(directory, 'note.txt');

try {
  const handle = await open(filename, 'wx', 0o600);
  try {
    await handle.writeFile('saved before close\n', 'utf8');
    if (process.argv.includes('--fail')) throw new Error('example failure after write');
  } finally {
    await handle.close();
    console.log('handle closed');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try {
    console.log((await readFile(filename, 'utf8')).trimEnd());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
