import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { requireWebAccess, type AccountAccess } from './account-access.js';
import type { SessionIdentity } from './auth-context.js';
import { AvatarObjects } from './avatar-objects.js';
import { DatabaseService } from './database.service.js';
import type { Prisma } from './generated/prisma/client.js';
import { HttpError } from './http.js';

type Tx = Prisma.TransactionClient;
type Account = AccountAccess & { id: string; avatarId: string | null; visible: boolean };
const unauthenticated = () => new HttpError(401, 'Authentication required', 'AUTH_REQUIRED');
const unavailable = () => new HttpError(503, 'Avatar storage unavailable', 'AVATAR_STORAGE_UNAVAILABLE');

async function lockSession(tx: Tx, identity: SessionIdentity, account: Account | undefined) {
  if (!account) throw unauthenticated();
  requireWebAccess(account);
  const [session] = await tx.$queryRaw<{ expiresAt: Date }[]>`SELECT expires_at AS "expiresAt"
    FROM public.sessions WHERE id=${identity.sessionId}::uuid AND user_id=${identity.userId}::uuid FOR SHARE`;
  if (!session) throw unauthenticated();
  return session.expiresAt;
}

async function currentTime(tx: Tx, expiresAt: Date) {
  const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp()::timestamptz(3) AS now`;
  if (!clock || expiresAt <= clock.now) throw unauthenticated();
  return clock.now;
}

async function lockOwner(tx: Tx, identity: SessionIdentity) {
  const [owner] = await tx.$queryRaw<Account[]>`SELECT id, status, web_enabled AS "webEnabled",
    avatar_id AS "avatarId", avatar_visible AS visible FROM public.users WHERE id=${identity.userId}::uuid FOR UPDATE`;
  if (!owner) throw unauthenticated();
  return { owner, expiresAt: await lockSession(tx, identity, owner) };
}

@Injectable()
export class AvatarPublication {
  constructor(private readonly database: DatabaseService, private readonly objects: AvatarObjects) {}

  private async transaction<T>(operation: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    const result = await this.database.run(operation, () => this.database.client.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
      return work(tx);
    }).catch((error: unknown) => {
      // Business rejections have already rolled back the transaction.
      if (error instanceof HttpError) return error;
      throw error;
    }));
    if (result instanceof HttpError) throw result;
    return result;
  }

  async reserve(identity: SessionIdentity) {
    this.objects.ready();
    return this.transaction('reserveAvatar', async tx => {
      const { expiresAt } = await lockOwner(tx, identity);
      await tx.$executeRaw`UPDATE public.avatar_writes SET state='retired', check_after=clock_timestamp()
        WHERE user_id=${identity.userId}::uuid AND state='writing'`;
      const now = await currentTime(tx, expiresAt);
      const id = randomUUID();
      await tx.$executeRaw`INSERT INTO public.avatar_writes(id,user_id,state,check_after)
        VALUES (${id}::uuid,${identity.userId}::uuid,'writing',${now}::timestamptz + interval '5 minutes')`;
      return id;
    });
  }

  async publish(identity: SessionIdentity, id: string, bytes: Buffer) {
    try { await this.objects.put(id, bytes); }
    catch { throw unavailable(); }
    return this.transaction('publishAvatar', async tx => {
      const { owner, expiresAt } = await lockOwner(tx, identity);
      const [write] = await tx.$queryRaw<{ state: string; deadline: Date | null }[]>`SELECT state, check_after AS deadline
        FROM public.avatar_writes WHERE id=${id}::uuid AND user_id=${identity.userId}::uuid FOR UPDATE`;
      const now = await currentTime(tx, expiresAt);
      if (write?.state !== 'writing' || !write.deadline || write.deadline <= now) {
        throw new HttpError(409, 'Avatar upload expired or was superseded', 'AVATAR_SUPERSEDED');
      }
      await tx.avatarWrite.update({ where: { id }, data: { state: 'live', checkAfter: null } });
      await tx.user.update({ where: { id: owner.id }, data: { avatarId: id } });
      if (owner.avatarId) {
        await tx.$executeRaw`UPDATE public.avatar_writes SET state='retired',
          check_after=${now}::timestamptz + interval '30 seconds' WHERE id=${owner.avatarId}::uuid`;
      }
      return { avatarId: id };
    });
  }

  async visibility(identity: SessionIdentity, visible: boolean) {
    return this.transaction('setAvatarVisibility', async tx => {
      const { owner, expiresAt } = await lockOwner(tx, identity);
      await currentTime(tx, expiresAt);
      await tx.user.update({ where: { id: owner.id }, data: { avatarVisible: visible } });
      return { visible };
    });
  }

  private async readAccount(identity: SessionIdentity, targetId: string) {
    return this.transaction('readAvatarAccount', async tx => {
      const accounts = await tx.$queryRaw<Account[]>`SELECT id, status, web_enabled AS "webEnabled",
        avatar_id AS "avatarId", avatar_visible AS visible FROM public.users
        WHERE id IN (${identity.userId}::uuid, ${targetId}::uuid) ORDER BY id FOR SHARE`;
      const expiresAt = await lockSession(tx, identity, accounts.find(row => row.id === identity.userId));
      const now = await currentTime(tx, expiresAt);
      const target = accounts.find(row => row.id === targetId);
      if (!target || target.status !== 'active' || !target.webEnabled) {
        throw new HttpError(404, 'Avatar unavailable', 'AVATAR_NOT_FOUND');
      }
      return { target, now };
    });
  }

  async getVisibility(identity: SessionIdentity) {
    const { target } = await this.readAccount(identity, identity.userId);
    return { visible: target.visible };
  }

  async read(identity: SessionIdentity, publicUserId?: string) {
    const { target, now } = await this.readAccount(identity, publicUserId ?? identity.userId);
    const avatarId = target.avatarId;
    if (!avatarId || (publicUserId !== undefined && !target.visible)) {
      throw new HttpError(404, 'Avatar unavailable', 'AVATAR_NOT_FOUND');
    }
    // The signature clock is fixed while the current pointer is still locked.
    try { return { avatarId, url: await this.objects.url(avatarId, now), expiresIn: 30 as const }; }
    catch { throw unavailable(); }
  }
}
