const cases = [
  'q=hello+world',
  'q=hello%2Bworld',
  'q=one&q=two',
  'q=',
  'limit=01',
  'q=%252F',
];
for (const query of cases) {
  const url = new URL(`/captures?${query}`, 'http://127.0.0.1');
  console.log(query, JSON.stringify({
    first: url.searchParams.get('q'),
    all: url.searchParams.getAll('q'),
    entries: [...url.searchParams],
  }));
}
const url = new URL('http://127.0.0.1/captures');
url.searchParams.set('q', 'C++ & Node');
url.hash = 'only-in-client';
console.log('built:', url.href);
console.log('request target:', url.pathname + url.search);
console.log('decoded once:', url.searchParams.get('q'));
