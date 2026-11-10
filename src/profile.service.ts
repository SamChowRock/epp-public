import { Injectable } from '@nestjs/common';
import { webAccessFailure, type AccountAccess } from './account-access.js';
import { ApplicationState } from './application-state.js';
import type { SessionIdentity } from './auth-context.js';
import { DatabaseService } from './database.service.js';
import { HttpError } from './http.js';
import type { Profile, ProfileInput } from './profile-contract.js';

@Injectable()
export class ProfileService {
  constructor(private readonly database: DatabaseService, private readonly state: ApplicationState) {}

  async own(userId: string) {
    const [row] = await this.state.track(() => this.database.run('readOwnProfile', () => this.database.client.$queryRaw<Profile[]>`
      SELECT id AS "userId", nickname, nickname_visible AS "nicknameVisible"
      FROM public.users WHERE id=${userId}::uuid AND status='active' AND web_enabled`));
    if (!row) throw new HttpError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
    return row;
  }

  async published(userId: string) {
    const [row] = await this.state.track(() => this.database.run('readPublicProfile', () => this.database.client.$queryRaw<Pick<Profile,'userId'|'nickname'>[]>`
      SELECT id AS "userId", CASE WHEN nickname_visible THEN nickname END AS nickname
      FROM public.users WHERE id=${userId}::uuid AND status='active' AND web_enabled`));
    if (!row) throw new HttpError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
    return row;
  }

  async patch(identity: SessionIdentity, input: ProfileInput): Promise<Profile> {
    const { userId, sessionId } = identity;
    const result = await this.state.track(() => this.database.run('patchOwnProfile', () => this.database.client.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
      const [account] = await tx.$queryRaw<(AccountAccess & Pick<Profile,'nickname'|'nicknameVisible'>)[]>`
        SELECT status, web_enabled AS "webEnabled", nickname, nickname_visible AS "nicknameVisible"
        FROM public.users WHERE id=${userId}::uuid FOR UPDATE`;
      if (!account) return 'AUTH_REQUIRED' as const;
      const denied = webAccessFailure(account);
      if (denied) return denied;

      const [session] = await tx.$queryRaw<{ expiresAt: Date }[]>`
        SELECT expires_at AS "expiresAt" FROM public.sessions
        WHERE id=${sessionId}::uuid AND user_id=${userId}::uuid FOR UPDATE`;
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp()::timestamptz(3) AS now`;
      if (!clock) throw new Error('Missing database time');
      if (!session || session.expiresAt <= clock.now) return 'AUTH_REQUIRED' as const;

      const nickname = input.nickname ?? account.nickname;
      const nicknameVisible = input.nicknameVisible ?? account.nicknameVisible;
      if (nickname !== account.nickname) {
        await tx.$executeRaw`DELETE FROM public.nickname_changes
          WHERE user_id=${userId}::uuid AND changed_at <= ${clock.now}::timestamptz - interval '720 hours'`;
        const used = await tx.nicknameChange.count({ where: { userId } });
        if (used >= 3) return 'NICKNAME_CHANGE_LIMIT' as const;
        await tx.nicknameChange.create({ data: { userId, changedAt: clock.now } });
      }
      if (nickname !== account.nickname || nicknameVisible !== account.nicknameVisible) {
        await tx.user.update({ where: { id: userId }, data: { nickname, nicknameVisible } });
      }
      return { userId, nickname, nicknameVisible };
    }, { maxWait: 2000, timeout: 5000 })));
    if (result === 'AUTH_REQUIRED') throw new HttpError(401, 'Authentication required', result);
    if (result === 'NICKNAME_CHANGE_LIMIT') throw new HttpError(429, 'Nickname change limit reached', result);
    if (typeof result === 'string') throw new HttpError(403, 'Account is not permitted to use this service', result);
    return result;
  }
}
