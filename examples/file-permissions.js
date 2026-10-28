import { chmod, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'epp-permissions-'));
const filename = join(directory, 'note.txt');

async function observe(label, action) {
  try {
    await action();
    console.log(`${label}: OK`);
  } catch (error) {
    console.log(`${label}: ${error.code ?? error.name}`);
  }
}

try {
  await writeFile(filename, 'example\n', { flag: 'wx', mode: 0o600 });
  await chmod(directory, 0o300);
  await observe('list names without directory r', () => readdir(directory));
  await observe('read known name with directory x', () => readFile(filename));

  await chmod(directory, 0o600);
  await observe('read without directory x', () => readFile(filename));

  await chmod(directory, 0o500);
  await observe('read without directory w', () => readFile(filename));
  await observe('create without directory w', () => writeFile(join(directory, 'new.txt'), 'new', { flag: 'wx' }));

  await chmod(directory, 0o700);
  await chmod(filename, 0o400);
  await observe('write read-only file', () => writeFile(filename, 'changed'));
  await observe('unlink read-only file', () => unlink(filename));
} finally {
  await chmod(directory, 0o700);
  await rm(directory, { recursive: true, force: true });
}
