import { ArrayCaptureStore } from '../dist/src/array-capture.store.js';
import { MemoryCaptureStore } from '../dist/src/memory-capture.store.js';

const a = {
  id: '00000000-0000-4000-8000-000000000001',
  originalText: '初稿',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const b = { ...a, originalText: '改稿' };

async function observe(Store) {
  const store = new Store();
  const attempts = await Promise.allSettled([store.insert(a), store.insert(b)]);
  const rows = await store.list({});
  const found = await store.find(a.id);
  return {
    outcomes: attempts.map(result => result.status),
    texts: rows.map(row => row.originalText),
    detail: found?.originalText,
  };
}

for (const Store of [ArrayCaptureStore, MemoryCaptureStore]) {
  console.log(Store.name, await observe(Store));
}
