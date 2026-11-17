import { createInterface } from 'node:readline';

const requestId = process.argv[2];
if (!requestId || !/^[0-9a-f-]{36}$/i.test(requestId)) {
  console.error('Usage: node examples/filter-logs.mjs <request-id> < logs/dev.log');
  process.exitCode = 1;
} else {
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry?.message?.requestId === requestId) console.log(JSON.stringify(entry));
  }
}
