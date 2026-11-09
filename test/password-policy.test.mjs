import test from 'node:test';
import assert from 'node:assert/strict';
import { argon2id, hash } from 'argon2';
import { hashPassword, verifyPassword } from '../dist/src/password.js';

test('new credentials screen whole candidates locally, preserving an accepted phrase verbatim', async () => {
  const context = { userId: 'b613cf41-d112-4f8e-adb1-bf939e88131a', email: 'fictional-reader1@example.test' };
  for (const weak of ['password123456789', '1Q2W3E4R5T6Y7U8I', '       password       ', '🙂'.repeat(15),
    ' '.repeat(15), 'EPP-book-password', context.userId, context.email, 'FICTIONAL-READER1']) {
    await assert.rejects(hashPassword(weak, context), /PASSWORD_BLOCKLISTED/);
  }
  const phrase = '  Fictional-Reader1 picked café furniture  ';
  const encoded = await hashPassword(phrase, context);
  assert(await verifyPassword(encoded, phrase.normalize('NFD')));
  assert.equal(await verifyPassword(encoded, phrase.trim()), false);
});

test('a credential created under the previous policy still authenticates', async () => {
  const old = '123456789123456789';
  const encoded = await hash(old, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32 });
  assert.equal(await verifyPassword(encoded, old), true);
  await assert.rejects(hashPassword(old), /PASSWORD_BLOCKLISTED/);
});
