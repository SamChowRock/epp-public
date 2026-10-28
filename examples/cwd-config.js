import { readFile } from 'node:fs/promises';

try {
  const text = await readFile('./config/service.json', 'utf8');
  console.log(JSON.parse(text));
} catch (error) {
  console.error(`Cannot read config from cwd (${error.code ?? error.name})`);
  process.exitCode = 1;
}
