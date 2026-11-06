import type { PrismaClient } from './generated/prisma/client.js';
import { hashPassword, verifyPassword } from './password.js';
import { DEVELOPMENT_USER_ID } from './database-config.js';

export async function initializeDevelopmentPassword(db: PrismaClient, password: unknown): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db.passwordCredential.create({
    data: { userId: DEVELOPMENT_USER_ID, passwordHash }, select: { userId: true },
  });
}

export async function verifyDevelopmentPassword(db: PrismaClient, password: unknown): Promise<boolean> {
  const credential = await db.passwordCredential.findUnique({ where: { userId: DEVELOPMENT_USER_ID } });
  return credential !== null && await verifyPassword(credential.passwordHash, password);
}
