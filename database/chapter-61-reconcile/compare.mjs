import { readFile } from 'node:fs/promises';
import { compare, html, writePrivate, demand, safeError } from './lib.mjs';

process.umask(0o077);
try {
  const [db, objects, out] = process.argv.slice(2);
  demand(process.argv.length === 5 && out.endsWith('.json'));
  const result = compare(
    JSON.parse(await readFile(db, 'utf8')),
    JSON.parse(await readFile(objects, 'utf8')),
  );
  // Exclusive creation protects both outputs; if the HTML exists the JSON may
  // already have been written. Use a new stem for each observation.
  await writePrivate(out, JSON.stringify(result, null, 2) + '\n');
  await writePrivate(out.slice(0, -5) + '.html', html(result));
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
}
