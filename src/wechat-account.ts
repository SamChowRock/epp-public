import { randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service.js';
import { SESSION_SECONDS } from './session.service.js';
import { issueToken, tokenDigest } from './token.js';
import { HttpError } from './http.js';

export async function resolveWechatAccount(database: DatabaseService, appId: string, openId: string,
  channel: 'mini' | 'web', label: string, proof?: { userId: string; passwordHash: string }) {
  const token = issueToken(), sessionId = randomUUID();
  const result = await database.run('createWechatSession', () => database.client.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
    // The first login has no mapping row to lock yet. All mapping writers take this lock first.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${appId + ':' + openId}, 0))::text`;
    const mapping = await tx.wechatIdentity.findUnique({ where: { appId_openId: { appId, openId } } });
    if (proof && mapping && mapping.userId !== proof.userId) return { error: 'IDENTITY_CONFLICT' };
    let userId = mapping?.userId ?? proof?.userId;
    if (!userId) {
      userId = randomUUID();
      await tx.user.create({ data: { id: userId } });
    }
    const [account] = await tx.$queryRaw<{ status: string; miniEnabled: boolean; webEnabled: boolean }[]>`
      SELECT status, mini_enabled AS "miniEnabled", web_enabled AS "webEnabled" FROM public.users WHERE id = ${userId}::uuid FOR UPDATE
    `;
    if (!account || account.status !== 'active') return { error: 'ACCOUNT_DISABLED' };
    if (proof) {
      const credential = await tx.passwordCredential.findUnique({ where: { userId } });
      if (credential?.passwordHash !== proof.passwordHash) return { error: 'AUTH_REQUIRED' };
      const other = await tx.wechatIdentity.findUnique({ where: { appId_userId: { appId, userId } } });
      if (other && other.openId !== openId) return { error: 'IDENTITY_CONFLICT' };
    }
    const enabled = channel === 'web' ? account.webEnabled : account.miniEnabled;
    let full = false;
    if (enabled) {
      await tx.$executeRaw`DELETE FROM public.sessions WHERE user_id = ${userId}::uuid AND expires_at <= clock_timestamp()`;
      full = await tx.session.count({ where: { userId } }) >= 20;
    }
    // Website linking can succeed independently of session issuance. Mini linking on an
    // enabled account establishes a new login method only when it can issue the session.
    if (!mapping && (channel === 'web' || !full)) await tx.wechatIdentity.create({ data: { appId, openId, userId } });
    if (!enabled) return { userId, pending: true as const };
    if (full) return { error: 'SESSION_LIMIT' };
    await tx.$executeRaw`
      INSERT INTO public.sessions(id, user_id, token_digest, label, channel, expires_at)
      VALUES (${sessionId}::uuid, ${userId}::uuid, ${tokenDigest(token)}, ${label}, ${channel},
        clock_timestamp() + interval '8 hours')
    `;
    return { userId };
  }, { maxWait: 2000, timeout: 5000 }));
  if (result.pending) return { userId: result.userId, pending: true as const };
  if (result.error) {
    const status = result.error === 'IDENTITY_CONFLICT' ? 409 : result.error === 'AUTH_REQUIRED' ? 401
      : result.error === 'SESSION_LIMIT' ? 429 : 403;
    throw new HttpError(status, 'WeChat login or account association was not permitted', result.error);
  }
  return { userId: result.userId, sessionId, token, expiresIn: SESSION_SECONDS };
}
