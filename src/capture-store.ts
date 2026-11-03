import type { CaptureRevision, RevisionContent } from './capture-revision.js';
import type { Capture, CaptureListOptions } from './capture.js';

export const CAPTURE_STORE = Symbol('CAPTURE_STORE');

export interface CaptureStore {
  appendRevision(id: string, content: RevisionContent): Promise<CaptureRevision | undefined>;
  revisions(id: string, before: number | undefined, take: number): Promise<CaptureRevision[] | undefined>;
  insert(capture: Capture): Promise<void>;
  list(options: CaptureListOptions): Promise<Capture[]>;
  find(id: string): Promise<Capture | undefined>;
  updateIntent(id: string, chineseIntent: string | null): Promise<Capture | undefined>;
}
