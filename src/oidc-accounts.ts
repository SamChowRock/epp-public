import { randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service.js';
import { issueToken, tokenDigest } from './token.js';
import type { LinkProof } from './oidc-flow.js';
import { HttpError } from './http.js';

export async function resolveOidcAccount(db: DatabaseService, issuer: string, subject: string, proof?: LinkProof) {
  const token = issueToken();
  const result = await db.run('resolveOidcAccount', () => db.client.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
    const key = JSON.stringify([issuer,subject]);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 38))::text`;
    const mapping = await tx.oidcIdentity.findUnique({ where: { issuer_subject: { issuer, subject } } });
    if (mapping && proof && proof.userId !== mapping.userId) return { error: 'IDENTITY_CONFLICT' } as const;
    const userId = mapping?.userId ?? proof?.userId ?? randomUUID();
    if (!proof && !mapping) await tx.user.create({ data: { id: userId } });
    const [user] = await tx.$queryRaw<{status: string; webEnabled: boolean}[]>`
      SELECT status, web_enabled AS "webEnabled" FROM public.users WHERE id=${userId}::uuid FOR UPDATE`;
    if (!user || user.status !== 'active') return { error: 'ACCOUNT_DISABLED' } as const;
    if (proof) {
      const credential = await tx.passwordCredential.findUnique({ where: { userId } });
      if (!credential || credential.passwordHash !== proof.passwordHash) return { error: 'AUTH_REQUIRED' } as const;
      const existing = await tx.oidcIdentity.findUnique({ where: { issuer_userId: { issuer, userId } } });
      if (existing && existing.subject !== subject) return { error: 'IDENTITY_CONFLICT' } as const;
    }
    if (!mapping) await tx.oidcIdentity.create({ data: { issuer, subject, userId } });
    if (!user.webEnabled) return { userId, pending: true } as const;
    await tx.$executeRaw`DELETE FROM public.sessions WHERE user_id=${userId}::uuid AND expires_at <= clock_timestamp()`;
    if (await tx.session.count({ where: { userId } }) >= 20) return { error: 'SESSION_LIMIT' } as const;
    await tx.$executeRaw`INSERT INTO public.sessions(id,user_id,token_digest,label,channel,expires_at)
      VALUES (${randomUUID()}::uuid,${userId}::uuid,${tokenDigest(token)},'OIDC login','web',clock_timestamp()+interval '8 hours')`;
    return { userId, pending: false } as const;
  }, { maxWait: 2000, timeout: 5000 }));
  if (result.error) {
    const status = { IDENTITY_CONFLICT: 409, ACCOUNT_DISABLED: 403, AUTH_REQUIRED: 401, SESSION_LIMIT: 429 }[result.error];
    throw new HttpError(status, 'External login did not create a session', result.error);
  }
  return result.pending ? { userId: result.userId } : { userId: result.userId, token };
}
