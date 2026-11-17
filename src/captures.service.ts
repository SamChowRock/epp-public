import { isPostgresText } from './postgres-text.js';
import { randomUUID } from 'node:crypto';
import type { Capture, CaptureListOptions } from './capture.js';
import type { CaptureStore } from './capture-store.js';

export class InvalidCaptureError extends Error {}
export class CaptureNotFoundError extends Error {}

export class CapturesService {
  constructor(private readonly store: CaptureStore) {}

  private validateIntent(value: unknown): asserts value is string | null {
    if (value === null) return;
    if (typeof value !== 'string' || !value.trim() ||
        value.length > 1000 || !isPostgresText(value)) {
      throw new InvalidCaptureError('chineseIntent must be null or non-empty, at most 1000 code units, and well-formed Unicode without NUL');
    }
  }

  async create(originalText: unknown, chineseIntent: unknown = null): Promise<Capture> {
    if (typeof originalText !== 'string' || !originalText.trim()) {
      throw new InvalidCaptureError('originalText must be a non-empty string');
    }
    if (!isPostgresText(originalText)) {
      throw new InvalidCaptureError('originalText must be well-formed Unicode without NUL');
    }
    if (originalText.length > 2000) {
      throw new InvalidCaptureError('originalText must be at most 2000 code units');
    }
    this.validateIntent(chineseIntent);
    const capture: Capture = {
      id: randomUUID(),
      originalText,
      chineseIntent,
      createdAt: new Date().toISOString(),
    };
    await this.store.insert(capture);
    return { ...capture };
  }

  async list({ text, limit }: CaptureListOptions = {}): Promise<Capture[]> {
    if (text !== undefined &&
        (typeof text !== 'string' || !text.trim() || text.length > 200 || !isPostgresText(text))) {
      throw new InvalidCaptureError('text must be non-empty, at most 200 code units, and well-formed Unicode without NUL');
    }
    if (limit !== undefined &&
        (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw new InvalidCaptureError('limit must be an integer from 1 to 100');
    }
    return this.store.list({ text, limit });
  }

  async updateIntent(id: string, chineseIntent: unknown): Promise<Capture> {
    this.validateIntent(chineseIntent);
    const capture = await this.store.updateIntent(id, chineseIntent);
    if (!capture) throw new CaptureNotFoundError('Capture not found');
    return { ...capture };
  }

  async find(id: string): Promise<Capture> {
    const capture = await this.store.find(id);
    if (!capture) throw new CaptureNotFoundError('Capture not found');
    return { ...capture };
  }
}
