import type { PrismaClient } from './generated/prisma/client.js';
import { hashPassword, verifyPassword } from './password.js';
import { DEVELOPMENT_USER_ID } from './database-config.js';

export async function initializePassword(db: PrismaClient, password: unknown, userId = DEVELOPMENT_USER_ID): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db.passwordCredential.create({
    data: { userId, passwordHash }, select: { userId: true },
  });
}

export async function verifyPasswordCredential(db: PrismaClient, password: unknown, userId = DEVELOPMENT_USER_ID): Promise<boolean> {
  const credential = await db.passwordCredential.findUnique({ where: { userId } });
  return credential !== null && await verifyPassword(credential.passwordHash, password);
}
