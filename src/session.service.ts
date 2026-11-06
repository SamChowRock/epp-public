import { randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service.js';
import { ApplicationState } from './application-state.js';
import { hashPassword, verifyPassword } from './password.js';
import { issueToken, tokenDigest } from './token.js';
import { HttpError } from './http.js';
import type { SessionIdentity } from './auth-context.js';
import type { ChangePasswordInput, LoginInput } from './auth-contract.js';
import { webAccessFailure, type AccountAccess } from './account-access.js';

export const SESSION_SECONDS = 8 * 60 * 60;
type Credential = { passwordHash: string };
const unauthorized = () => new HttpError(401, 'Credentials or session are invalid', 'AUTH_REQUIRED');

export class SessionService {
  private dummyHash = '';
  private activePasswords = 0;
  constructor(private readonly database: DatabaseService, private readonly state: ApplicationState) {}
  async onModuleInit(): Promise<void> { this.dummyHash = await hashPassword(issueToken()); }

  private passwordWork<T>(work: () => Promise<T>): Promise<T> {
    if (this.activePasswords >= 2) throw new HttpError(429, 'Password service is busy', 'AUTH_BUSY');
    this.activePasswords++;
    return this.state.track(work).finally(() => { this.activePasswords--; });
  }

  login(input: LoginInput) {
    return this.passwordWork(async () => {
      const credential = await this.database.run('readLoginCredential', () => this.database.client.passwordCredential.findUnique({
        where: { userId: input.userId }, select: { passwordHash: true },
      }));
      const verified = await verifyPassword(credential?.passwordHash ?? this.dummyHash, input.password);
      if (!credential || !verified) throw unauthorized();
      const token = issueToken(), id = randomUUID();
      const result = await this.database.run('createSession', () => this.database.client.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
        const [account] = await tx.$queryRaw<AccountAccess[]>`
          SELECT status, web_enabled AS "webEnabled" FROM public.users WHERE id = ${input.userId}::uuid FOR UPDATE
        `;
        if (!account) return 'changed' as const;
        const denied = webAccessFailure(account);
        if (denied) return denied;
        const [current] = await tx.$queryRaw<Credential[]>`
          SELECT password_hash AS "passwordHash" FROM public.password_credentials
          WHERE user_id = ${input.userId}::uuid FOR UPDATE
        `;
        if (current?.passwordHash !== credential.passwordHash) return 'changed' as const;
        await tx.$executeRaw`DELETE FROM public.sessions WHERE user_id = ${input.userId}::uuid AND expires_at <= clock_timestamp()`;
        if (await tx.session.count({ where: { userId: input.userId } }) >= 20) return 'limit' as const;
        await tx.$executeRaw`
          INSERT INTO public.sessions(id, user_id, token_digest, label, expires_at)
          VALUES (${id}::uuid, ${input.userId}::uuid, ${tokenDigest(token)}, ${input.label},
            clock_timestamp() + interval '8 hours')
        `;
        return 'created' as const;
      }, { maxWait: 2000, timeout: 5000 }));
      if (result === 'changed') throw unauthorized();
      if (result === 'limit') throw new HttpError(429, 'Revoke an existing session before logging in again', 'SESSION_LIMIT');
      if (result !== 'created') throw new HttpError(403, 'Account is not permitted to use this service', result);
      return { token, identity: { userId: input.userId, sessionId: id } };
    });
  }

  async authenticate(token: string): Promise<(SessionIdentity & AccountAccess) | undefined> {
    let digest: string;
    try { digest = tokenDigest(token); } catch { return undefined; }
    const rows = await this.state.track(() => this.database.run('authenticateSession', () => this.database.client.$queryRaw<(SessionIdentity & AccountAccess)[]>`
      SELECT s.id AS "sessionId", s.user_id AS "userId", u.status, u.web_enabled AS "webEnabled"
      FROM public.sessions s JOIN public.users u ON u.id = s.user_id
      WHERE s.token_digest = ${digest} AND s.expires_at > clock_timestamp()
    `));
    return rows[0];
  }

  async list(identity: SessionIdentity) {
    const rows = await this.state.track(() => this.database.run('listSessions', () => this.database.client.$queryRaw<{
      id: string; label: string; createdAt: Date; expiresAt: Date;
    }[]>`
      SELECT id, label, created_at AS "createdAt", expires_at AS "expiresAt"
      FROM public.sessions WHERE user_id = ${identity.userId}::uuid AND expires_at > clock_timestamp()
      ORDER BY created_at DESC, id DESC LIMIT 20
    `));
    return { items: rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(), current: row.id === identity.sessionId })) };
  }

  async revoke(userId: string, id: string): Promise<void> {
    await this.state.track(() => this.database.run('revokeSession', () => this.database.client.session.deleteMany({ where: { id, userId } })));
  }

  changePassword(identity: SessionIdentity, input: ChangePasswordInput): Promise<void> {
    return this.passwordWork(async () => {
      const credential = await this.database.run('readChangeCredential', () => this.database.client.passwordCredential.findUnique({
        where: { userId: identity.userId }, select: { passwordHash: true },
      }));
      if (!credential || !await verifyPassword(credential.passwordHash, input.currentPassword)) throw unauthorized();
      let passwordHash: string;
      try { passwordHash = await hashPassword(input.newPassword); }
      catch (error) {
        if (error instanceof Error && error.message === 'PASSWORD_INPUT_INVALID') {
          throw new HttpError(400, 'New password does not meet the input policy', 'PASSWORD_INPUT_INVALID');
        }
        throw error;
      }
      const changed = await this.database.run('changePassword', () => this.database.client.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
        const [account] = await tx.$queryRaw<AccountAccess[]>`
          SELECT status, web_enabled AS "webEnabled" FROM public.users WHERE id = ${identity.userId}::uuid FOR UPDATE
        `;
        if (!account) return 'invalid' as const;
        const denied = webAccessFailure(account);
        if (denied) return denied;
        const [current] = await tx.$queryRaw<Credential[]>`
          SELECT password_hash AS "passwordHash" FROM public.password_credentials
          WHERE user_id = ${identity.userId}::uuid FOR UPDATE
        `;
        if (current?.passwordHash !== credential.passwordHash) return 'invalid' as const;
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM public.sessions WHERE id = ${identity.sessionId}::uuid
            AND user_id = ${identity.userId}::uuid FOR UPDATE
        `;
        if (locked.length !== 1) return 'invalid' as const;
        // A time predicate can run before FOR UPDATE waits; check again after owning the lock.
        const [active] = await tx.$queryRaw<{ valid: boolean }[]>`
          SELECT expires_at > clock_timestamp() AS valid FROM public.sessions WHERE id = ${identity.sessionId}::uuid
        `;
        if (!active?.valid) return 'invalid' as const;
        await tx.passwordCredential.update({ where: { userId: identity.userId }, data: { passwordHash } });
        await tx.session.deleteMany({ where: { userId: identity.userId } });
        return 'changed' as const;
      }, { maxWait: 2000, timeout: 5000 }));
      if (changed === 'invalid') throw unauthorized();
      if (changed !== 'changed') throw new HttpError(403, 'Account is not permitted to use this service', changed);
    });
  }
}
