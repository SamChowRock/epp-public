// Read-only JS counterparts to 06-text-boundaries.sql; no DB dependency.
for (const [label, value] of [
  ['ASCII', 'A'], ['CJK', '中'], ['supplementary', '😀'], ['combining', 'e\u0301'],
]) {
  console.log({ label, utf16Units: value.length, codePoints: [...value].length,
    utf8Bytes: Buffer.byteLength(value, 'utf8') });
}
console.log({ emoji1001Utf16Units: '😀'.repeat(1001).length });
console.log({ tabAfterTrim: '\t'.trim().length });
for (const [label, value] of [['nul', 'a\u0000b'], ['loneSurrogate', 'a\uD800b']]) {
  console.log({ label, json: JSON.stringify(value), wellFormed: value.isWellFormed(),
    sameAfterUtf8RoundTrip: Buffer.from(value, 'utf8').toString('utf8') === value });
}
