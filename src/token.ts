import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function issueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokenDigest(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)
    || Buffer.from(value, 'base64url').toString('base64url') !== value) {
    throw new Error('TOKEN_INPUT_INVALID');
  }
  return createHash('sha256').update(value, 'ascii').digest('hex');
}

export function matchesToken(value: unknown, expected: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(expected)) return false;
  let actual: string;
  try { actual = tokenDigest(value); }
  catch { return false; }
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
