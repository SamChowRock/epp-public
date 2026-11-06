import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../dist/src/password.js';
import { issueToken, tokenDigest, matchesToken } from '../dist/src/token.js';

test('password verification preserves spaces, normalizes NFC, and rejects malformed input', async () => {
  const password = '  café learning phrase  ';
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(first, password), true);
  assert.equal(await verifyPassword(first, '  cafe\u0301 learning phrase  '), true);
  assert.equal(await verifyPassword(first, password.trim()), false);
  assert.equal(await verifyPassword(first, 'a different long password'), false);
  for (const value of ['', 'x'.repeat(14), 'x'.repeat(129), 'x'.repeat(15) + '\ud800', null]) {
    await assert.rejects(hashPassword(value), /PASSWORD_INPUT_INVALID/);
  }
  assert.equal(await verifyPassword(first, 'short'), false);
  assert.equal(await verifyPassword(first, null), false);
  await assert.rejects(verifyPassword('corrupt record', password), /PASSWORD_RECORD_INVALID/);
});

test('opaque tokens have a canonical representation and only the matching digest verifies', () => {
  const token = issueToken(), another = issueToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, another);
  const digest = tokenDigest(token);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(matchesToken(token, digest), true);
  assert.equal(matchesToken(another, digest), false);
  for (const value of ['', token + '=', null, 'A'.repeat(42) + 'B']) {
    assert.equal(matchesToken(value, digest), false);
    assert.throws(() => tokenDigest(value), /TOKEN_INPUT_INVALID/);
  }
  assert.equal(matchesToken(token, 'bad'), false);
});
