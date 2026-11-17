import type { Capture, CaptureListOptions } from './capture.js';
import type { CaptureStore } from './capture-store.js';

// Alternative in-memory representation for the isolated chapter-14 practice.
export class ArrayCaptureStore implements CaptureStore {
  private readonly captures: Capture[] = [];

  async insert(capture: Capture): Promise<void> {
    if (this.captures.some(item => item.id === capture.id)) {
      throw new Error('Capture ID already exists');
    }
    this.captures.push({ ...capture });
  }
  async list({ text, limit }: CaptureListOptions): Promise<Capture[]> {
    const result: Capture[] = [];
    for (const capture of this.captures) {
      if (text !== undefined && !capture.originalText.includes(text)) continue;
      result.push({ ...capture });
      if (limit !== undefined && result.length === limit) break;
    }
    return result;
  }
  async find(id: string): Promise<Capture | undefined> {
    const capture = this.captures.find(item => item.id === id);
    return capture === undefined ? undefined : { ...capture };
  }
}
