import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CaptureResponseSchema } from '../../capture-contract.js';
import type { Capture, CaptureListOptions } from '../../capture.js';
import type { CaptureStore } from '../../capture-store.js';

export async function readRows(file: string): Promise<Capture[]> {
  const rows = z.array(CaptureResponseSchema.strict()).parse(JSON.parse(await readFile(file, 'utf8')));
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate ID');
  return rows;
}

// Deliberately no coordination: this lab exposes lost updates.
export async function saveRows(file: string, rows: Capture[], replace = false,
  beforeRename: () => Promise<void> = async () => {}) {
  const data = JSON.stringify(rows, null, 2) + '\n';
  if (!replace) { await writeFile(file, data); return; }
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, data, { flag: 'wx', mode: 0o600 });
  await beforeRename();
  await rename(temp, file);
}

export class JsonFileStore implements CaptureStore {
  constructor(private readonly file: string) {}
  async insert(capture: Capture): Promise<void> {
    const rows = await readRows(this.file);
    if (rows.some(row => row.id === capture.id)) throw new Error('Duplicate ID');
    rows.push({ ...capture });
    await saveRows(this.file, rows);
  }
  async list({ text, limit }: CaptureListOptions): Promise<Capture[]> {
    const rows = await readRows(this.file);
    return rows.filter(row => text === undefined || row.originalText.includes(text)).slice(0, limit);
  }
  async find(id: string): Promise<Capture | undefined> {
    return (await readRows(this.file)).find(row => row.id === id);
  }
}
