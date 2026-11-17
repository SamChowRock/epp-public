import { randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service.js';
import { ApplicationState } from './application-state.js';
import { SessionService, SESSION_SECONDS } from './session.service.js';
import { issueToken, tokenDigest } from './token.js';
import { HttpError } from './http.js';
import type { MiniLogin, MiniLink } from './mini-contract.js';
import type { WechatExchange } from './wechat-login.js';

export class MiniService {
  constructor(private readonly database: DatabaseService, private readonly sessions: SessionService,
    private readonly state: ApplicationState, private readonly platform: WechatExchange) {}
  login(input: MiniLogin) { return this.state.track(() => this.create(input)); }
  link(input: MiniLink) {
    return this.sessions.passwordWork(async () => {
      const passwordHash = await this.sessions.provePassword(input.userId, input.password);
      return this.create(input, { userId: input.userId, passwordHash });
    });
  }
  private async create(input: MiniLogin, proof?: { userId: string; passwordHash: string }) {
    const { appId, openId } = await this.platform.exchange(input.code);
    const token = issueToken(), sessionId = randomUUID();
    const result = await this.database.run('createMiniSession', () => this.database.client.$transaction(async tx => {
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
      const [account] = await tx.$queryRaw<{ status: string; miniEnabled: boolean }[]>`
        SELECT status, mini_enabled AS "miniEnabled" FROM public.users WHERE id = ${userId}::uuid FOR UPDATE
      `;
      if (!account || account.status !== 'active') return { error: 'ACCOUNT_DISABLED' };
      if (proof) {
        const credential = await tx.passwordCredential.findUnique({ where: { userId } });
        if (credential?.passwordHash !== proof.passwordHash) return { error: 'AUTH_REQUIRED' };
        const other = await tx.wechatIdentity.findUnique({ where: { appId_userId: { appId, userId } } });
        if (other && other.openId !== openId) return { error: 'IDENTITY_CONFLICT' };
      }
      if (account.miniEnabled) {
        await tx.$executeRaw`DELETE FROM public.sessions WHERE user_id = ${userId}::uuid AND expires_at <= clock_timestamp()`;
        if (await tx.session.count({ where: { userId } }) >= 20) return { error: 'SESSION_LIMIT' };
      }
      if (!mapping) await tx.wechatIdentity.create({ data: { appId, openId, userId } });
      if (!account.miniEnabled) return { userId, pending: true as const };
      await tx.$executeRaw`
        INSERT INTO public.sessions(id, user_id, token_digest, label, channel, expires_at)
        VALUES (${sessionId}::uuid, ${userId}::uuid, ${tokenDigest(token)}, ${input.label}, 'mini',
          clock_timestamp() + interval '8 hours')
      `;
      return { userId };
    }, { maxWait: 2000, timeout: 5000 }));
    if (result.pending) return { userId: result.userId, miniEnabled: false as const };
    if (result.error) {
      const status = result.error === 'IDENTITY_CONFLICT' ? 409 : result.error === 'AUTH_REQUIRED' ? 401
        : result.error === 'SESSION_LIMIT' ? 429 : 403;
      throw new HttpError(status, 'Mini program login or account association was not permitted', result.error);
    }
    return { userId: result.userId, sessionId, token, expiresIn: SESSION_SECONDS };
  }
}
