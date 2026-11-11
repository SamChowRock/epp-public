// Pause the old reader only after it has obtained a consistent (version, page) pair.
import assert from 'node:assert/strict';

for (const versioned of [false, true]) {
  let data = { version: 8, page: 'page-8' };
  const cache = new Map();
  const key = v => versioned ? 'account-A:first:' + v : 'account-A:first';
  const captured = Promise.withResolvers(), resume = Promise.withResolvers();
  const late = (async () => {
    const snapshot = data;
    captured.resolve();
    await resume.promise;
    cache.set(key(snapshot.version), snapshot.page);
  })();
  await captured.promise;
  data = { version: 9, page: 'page-9' };
  cache.delete(key(8));
  resume.resolve();
  await late;
  const current = cache.get(key(data.version)) ?? data.page;
  console.log({ versioned, nextRead: current });
  assert.equal(current, versioned ? 'page-9' : 'page-8');
}
