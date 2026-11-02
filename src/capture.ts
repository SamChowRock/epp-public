export type Capture = {
  id: string;
  originalText: string;
  chineseIntent: string | null;
  createdAt: string;
};

export type CaptureListOptions = {
  text?: string;
  limit?: number;
};
