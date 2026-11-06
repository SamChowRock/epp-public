import { argon2id, hash, verify } from 'argon2';

const options = { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32 } as const;

function passwordText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 256 || !value.isWellFormed()) {
    throw new Error('PASSWORD_INPUT_INVALID');
  }
  const text = value.normalize('NFC');
  const length = [...text].length;
  if (length < 15 || length > 128) throw new Error('PASSWORD_INPUT_INVALID');
  return text;
}

export async function hashPassword(value: unknown): Promise<string> {
  return hash(passwordText(value), options);
}

export async function verifyPassword(encoded: string, value: unknown): Promise<boolean> {
  // shortcut: only this chapter's stored profile is accepted; add old/new profiles before changing costs.
  if (!/^\$argon2id\$v=19\$m=19456,(?:p=1,t=2|t=2,p=1)\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/.test(encoded)) {
    throw new Error('PASSWORD_RECORD_INVALID');
  }
  let text: string;
  try { text = passwordText(value); }
  catch { return false; }
  return verify(encoded, text);
}
