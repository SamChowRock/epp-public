import { writeFile } from 'node:fs/promises';
import { createOpenApiDocument } from '../dist/src/openapi.js';

await writeFile(new URL('../dist/openapi.json', import.meta.url),
  JSON.stringify(createOpenApiDocument(), null, 2) + '\n');
console.log('Wrote dist/openapi.json');
