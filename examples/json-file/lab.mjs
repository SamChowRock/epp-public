import { readFile, writeFile, copyFile, constants } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { readRows, saveRows } from '../../.dev/src/labs/json-file/store.js';

const [command, target, argument, mode = 'direct'] = process.argv.slice(2);
if (!target) throw new Error('Provide command and file');
const file = resolve(target);
async function gate(stage, id) {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  console.log(JSON.stringify({ stage, id }));
  try { await input.question('Press Enter to continue: '); }
  finally { input.close(); }
}
try {
  if (command === 'init') {
    await writeFile(file, '[]\n', { flag: 'wx', mode: 0o600 });
  } else if (command === 'copy') {
    if (!argument) throw new Error('Destination required');
    await copyFile(file, resolve(argument), constants.COPYFILE_EXCL);
  } else if (command === 'inspect') {
    const rows = await readRows(file);
    console.log(JSON.stringify({ count: rows.length, rows }, null, 2));
  } else if (command === 'input') {
    if (!argument) throw new Error('Text required');
    await writeFile(file, JSON.stringify({ id: randomUUID(), originalText: argument,
      createdAt: new Date().toISOString() }) + '\n', { flag: 'wx', mode: 0o600 });
  } else if (command === 'write') {
    if (!argument || !['direct', 'replace', 'before-rename', 'serial'].includes(mode)) throw new Error('Invalid write arguments');
    const capture = JSON.parse(await readFile(resolve(argument), 'utf8'));
    // Validate the saved input with the same format used for stored records.
    const { CaptureResponseSchema } = await import('../../.dev/src/capture-contract.js');
    CaptureResponseSchema.strict().parse(capture);
    const rows = await readRows(file);
    if (rows.some(row => row.id === capture.id)) throw new Error('Duplicate ID');
    rows.push(capture);
    if (mode !== 'serial') await gate('read-ready', capture.id);
    await saveRows(file, rows, mode === 'replace' || mode === 'before-rename',
      mode === 'before-rename' ? () => gate('temp-ready', capture.id) : undefined);
    console.log(JSON.stringify({ stage: 'saved', id: capture.id }));
  } else throw new Error('Unknown command');
} catch (error) {
  console.error(error instanceof Error ? error.name : 'Failure');
  process.exitCode = 1;
}
