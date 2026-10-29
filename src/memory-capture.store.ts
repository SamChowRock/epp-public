import type { Capture, CaptureListOptions } from './capture.js';
import type { CaptureStore } from './capture-store.js';

export class MemoryCaptureStore implements CaptureStore {
  private readonly captures = new Map<string, Capture>();

  async insert(capture: Capture): Promise<void> {
    if (this.captures.has(capture.id)) throw new Error('Capture ID already exists');
    this.captures.set(capture.id, { ...capture });
  }

  async list({ text, limit }: CaptureListOptions): Promise<Capture[]> {
    const items: Capture[] = [];
    for (const capture of this.captures.values()) {
      if (text !== undefined && !capture.originalText.includes(text)) continue;
      items.push({ ...capture });
      if (limit !== undefined && items.length === limit) break;
    }
    return items;
  }

  async find(id: string): Promise<Capture | undefined> {
    const capture = this.captures.get(id);
    return capture === undefined ? undefined : { ...capture };
  }
}
