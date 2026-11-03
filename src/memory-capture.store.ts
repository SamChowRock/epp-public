import { randomUUID } from 'node:crypto';
import type { CaptureRevision, RevisionContent } from './capture-revision.js';
import type { Capture, CaptureListOptions } from './capture.js';
import type { CaptureStore } from './capture-store.js';

export class MemoryCaptureStore implements CaptureStore {
  private readonly history = new Map<string, CaptureRevision[]>();
  private readonly captures = new Map<string, Capture>();

  async insert(capture: Capture): Promise<void> {
    if (this.captures.has(capture.id)) throw new Error('Capture ID already exists');
    this.captures.set(capture.id, { ...capture });
    this.history.set(capture.id, [{ id: randomUUID(), captureId: capture.id, revisionNo: 1,
      originalText: capture.originalText, chineseIntent: capture.chineseIntent,
      inputSource: 'manual', chunks: null, createdAt: capture.createdAt }]);
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

  async updateIntent(id: string, chineseIntent: string | null): Promise<Capture | undefined> {
    const capture = this.captures.get(id);
    if (!capture) return undefined;
    const latest = this.history.get(id)!.at(-1)!;
    const revision = (await this.appendRevision(id, { ...latest, chineseIntent }))!;
    return { ...capture, originalText: revision.originalText, chineseIntent: revision.chineseIntent };
  }

  async appendRevision(id: string, content: RevisionContent): Promise<CaptureRevision | undefined> {
    const capture = this.captures.get(id);
    if (!capture) return undefined;
    const history = this.history.get(id)!;
    const revision: CaptureRevision = { ...structuredClone(content), id: randomUUID(), captureId: id,
      revisionNo: history.at(-1)!.revisionNo + 1, createdAt: new Date().toISOString() };
    history.push(revision);
    this.captures.set(id, { ...capture, originalText: content.originalText, chineseIntent: content.chineseIntent });
    return structuredClone(revision);
  }

  async revisions(id: string, before: number | undefined, take: number): Promise<CaptureRevision[] | undefined> {
    const history = this.history.get(id);
    if (!history) return undefined;
    return structuredClone(history.filter(r => before === undefined || r.revisionNo < before).toReversed().slice(0, take));
  }

  async find(id: string): Promise<Capture | undefined> {
    const capture = this.captures.get(id);
    return capture === undefined ? undefined : { ...capture };
  }
}
