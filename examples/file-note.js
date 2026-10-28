import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

try {
  const directory = await mkdtemp(join(tmpdir(), 'epp-note-'));
  const filename = join(directory, 'note.txt');
  await writeFile(filename, 'EPP file example\n', { encoding: 'utf8', flag: 'wx' });
  console.log(await readFile(filename, 'utf8'));
  console.log(`Saved example: ${filename}`);
} catch (error) {
  console.error(`File example failed (${error.code ?? error.name})`);
  process.exitCode = 1;
}
