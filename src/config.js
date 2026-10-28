import { readFile } from 'node:fs/promises';

export async function loadConfig() {
  const configUrl = new URL('../config/service.json', import.meta.url);
  let text;
  try {
    text = await readFile(configUrl, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read config/service.json (${error.code ?? 'UNKNOWN'})`);
  }

  let defaults;
  try {
    defaults = JSON.parse(text);
  } catch {
    throw new Error('config/service.json must contain valid JSON');
  }
  if (defaults === null || typeof defaults !== 'object' || Array.isArray(defaults)) {
    throw new Error('config/service.json must contain an object');
  }
  if (!Number.isInteger(defaults.port) || defaults.port < 1 || defaults.port > 65535) {
    throw new Error('config/service.json port must be an integer from 1 to 65535');
  }

  const rawPort = process.env.PORT;
  if (rawPort === undefined) return { port: defaults.port };
  if (!/^[0-9]+$/.test(rawPort)) {
    throw new Error('PORT must be decimal digits from 1 to 65535');
  }
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  return { port };
}
