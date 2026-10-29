import { randomUUID } from 'node:crypto';

export type Capture = {
  id: string;
  originalText: string;
  createdAt: string;
};

export type CaptureListOptions = {
  text?: string;
  limit?: number;
};

export class InvalidCaptureError extends Error {}
export class CaptureNotFoundError extends Error {}

export class CapturesService {
  private readonly captures = new Map<string, Capture>();

  create(originalText: unknown): Capture {
    if (typeof originalText !== 'string' || !originalText.trim()) {
      throw new InvalidCaptureError('originalText must be a non-empty string');
    }
    if (originalText.length > 2000) {
      throw new InvalidCaptureError('originalText must be at most 2000 code units');
    }
    const capture: Capture = {
      id: randomUUID(),
      originalText,
      createdAt: new Date().toISOString(),
    };
    this.captures.set(capture.id, capture);
    return { ...capture };
  }

  list({ text, limit }: CaptureListOptions = {}): Capture[] {
    if (text !== undefined &&
        (typeof text !== 'string' || !text.trim() || text.length > 200)) {
      throw new InvalidCaptureError('text must be a non-empty string of at most 200 code units');
    }
    if (limit !== undefined &&
        (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw new InvalidCaptureError('limit must be an integer from 1 to 100');
    }
    const items: Capture[] = [];
    for (const capture of this.captures.values()) {
      if (text !== undefined && !capture.originalText.includes(text)) continue;
      items.push({ ...capture });
      if (limit !== undefined && items.length === limit) break;
    }
    return items;
  }

  find(id: string): Capture {
    const capture = this.captures.get(id);
    if (!capture) throw new CaptureNotFoundError('Capture not found');
    return { ...capture };
  }
}
