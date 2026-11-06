import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../dist/src/password.js';
import { issueToken, tokenDigest, matchesToken } from '../dist/src/token.js';

const password = 'Fabricated example password 32';
const first = await hashPassword(password), second = await hashPassword(password);
assert.notEqual(first, second);
assert(await verifyPassword(first, password));
assert.equal(await verifyPassword(first, password + '!'), false);
const token = issueToken(), digest = tokenDigest(token);
assert(matchesToken(token, digest));
assert.equal(matchesToken(issueToken(), digest), false);
console.log({ samePasswordDifferentHashes: first !== second, passwordVerified: true,
  tokenCharacters: token.length, digestCharacters: digest.length, tokenVerified: true });
