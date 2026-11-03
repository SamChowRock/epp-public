export type InputChunk = { text: string };
export type RevisionContent = {
  originalText: string;
  chineseIntent: string | null;
  inputSource: 'manual' | 'unknown';
  chunks: InputChunk[] | null;
};
export type CaptureRevision = RevisionContent & {
  id: string;
  captureId: string;
  revisionNo: number;
  createdAt: string;
};
export type RevisionPage = { items: CaptureRevision[]; nextBefore: number | null };
export class RevisionConflictError extends Error {
  constructor() { super('Revision number was taken; read the latest content before submitting again'); }
}
