import { randomUUID } from 'node:crypto';

export type Capture = {
  id: string;
  originalText: string;
  createdAt: string;
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

  list(): Capture[] {
    return [...this.captures.values()].map((capture) => ({ ...capture }));
  }

  find(id: string): Capture {
    const capture = this.captures.get(id);
    if (!capture) throw new CaptureNotFoundError('Capture not found');
    return { ...capture };
  }
}
