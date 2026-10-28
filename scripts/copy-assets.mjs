import { copyFile, mkdir } from 'node:fs/promises';

const target = new URL('../dist/config/', import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(
  new URL('../config/service.json', import.meta.url),
  new URL('service.json', target),
);
