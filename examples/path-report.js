import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2] ?? './input.json';
console.log(JSON.stringify({
  cwd: process.cwd(),
  bundledConfig: fileURLToPath(new URL('../config/service.json', import.meta.url)),
  userInput: resolve(process.cwd(), input),
  outputDirectory: resolve(process.cwd(), './exports'),
}, null, 2));
