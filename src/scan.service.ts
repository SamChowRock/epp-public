import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { ApplicationState } from './application-state.js';
import type { Prisma } from './generated/prisma/client.js';
import type { SessionIdentity } from './auth-context.js';
import { HttpError } from './http.js';
import { issueToken, tokenDigest } from './token.js';

type Ticket = { status: string; userId: string | null; miniSessionId: string | null };
const missing = () => new HttpError(404, 'Ticket unavailable; start again', 'SCAN_UNAVAILABLE');
const conflict = () => new HttpError(409, 'Ticket cannot make this transition', 'SCAN_CONFLICT');
const denied = () => new HttpError(403, 'Phone session or account no longer eligible', 'SCAN_DENIED');

@Injectable()
export class ScanService {
  constructor(private readonly db: DatabaseService, private readonly state: ApplicationState) {}

  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T | HttpError>): Promise<T> {
    const result = await this.state.track(() => this.db.run('browserLoginTicket', () =>
      this.db.client.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
        return work(tx);
      }, { maxWait: 2000, timeout: 5000 })));
    if (result instanceof HttpError) throw result;
    return result;
  }

  async start() {
    const scene = randomUUID(), browser = issueToken();
    await this.transaction(async tx => {
      await tx.$executeRaw`DELETE FROM public.browser_login_tickets WHERE scene IN (
        SELECT scene FROM public.browser_login_tickets WHERE expires_at <= clock_timestamp()
        ORDER BY expires_at LIMIT 32 FOR UPDATE SKIP LOCKED)`;
      await tx.$executeRaw`INSERT INTO public.browser_login_tickets(scene,browser_digest,expires_at)
        VALUES (${scene}::uuid,${tokenDigest(browser)},clock_timestamp()+interval '2 minutes')`;
    });
    return { scene, browser };
  }

  async observe(scene: string, digest?: string) {
    const rows = await this.state.track(() => this.db.run('readLoginTicket', () =>
      this.db.client.$queryRaw<{status: string}[]>`SELECT status FROM public.browser_login_tickets
        WHERE scene=${scene}::uuid AND (${digest ?? null}::text IS NULL OR browser_digest=${digest ?? null})
          AND expires_at > clock_timestamp()`));
    if (!rows[0]) throw missing();
    return rows[0];
  }

  cancel(scene: string, digest: string) {
    return this.transaction(async tx => {
      const ticket = await this.lockTicket(tx, scene, digest);
      if (!ticket) return missing();
      if (ticket.status === 'consumed') return conflict();
      const changed = await tx.$executeRaw`UPDATE public.browser_login_tickets
        SET status='cancelled',user_id=NULL,mini_session_id=NULL
        WHERE scene=${scene}::uuid AND browser_digest=${digest}
          AND status IN ('pending','confirmed','cancelled') AND expires_at > clock_timestamp()`;
      return changed ? { status: 'cancelled' } : missing();
    });
  }

  private async lockTicket(tx: Prisma.TransactionClient, scene: string, digest?: string) {
    const [row] = await tx.$queryRaw<Ticket[]>`SELECT status,user_id AS "userId",mini_session_id AS "miniSessionId"
      FROM public.browser_login_tickets WHERE scene=${scene}::uuid AND
      (${digest ?? null}::text IS NULL OR browser_digest=${digest ?? null}) AND expires_at > clock_timestamp() FOR UPDATE`;
    return row;
  }

  private async eligible(tx: Prisma.TransactionClient, userId: string, sessionId: string) {
    const [user] = await tx.$queryRaw<{allowed: boolean}[]>`SELECT
      status='active' AND mini_enabled AND web_enabled AS allowed FROM public.users WHERE id=${userId}::uuid FOR UPDATE`;
    if (!user?.allowed) return false;
    const rows = await tx.$queryRaw<{id:string}[]>`SELECT id FROM public.sessions WHERE id=${sessionId}::uuid
      AND user_id=${userId}::uuid AND channel='mini' AND expires_at > clock_timestamp() FOR SHARE`;
    return rows.length === 1;
  }

  confirm(scene: string, identity: SessionIdentity) {
    return this.transaction(async tx => {
      const ticket = await this.lockTicket(tx, scene);
      if (!ticket) return missing();
      if (ticket.status !== 'pending' && !(ticket.status === 'confirmed' && ticket.miniSessionId === identity.sessionId)) return conflict();
      if (!await this.eligible(tx, identity.userId, identity.sessionId)) return denied();
      const changed = await tx.$executeRaw`UPDATE public.browser_login_tickets SET status='confirmed',
        user_id=${identity.userId}::uuid,mini_session_id=${identity.sessionId}::uuid
        WHERE scene=${scene}::uuid AND expires_at > clock_timestamp() AND EXISTS
          (SELECT 1 FROM public.sessions WHERE id=${identity.sessionId}::uuid AND expires_at > clock_timestamp())`;
      return changed ? { status: 'confirmed' } : missing();
    });
  }

  consume(scene: string, digest: string) {
    return this.transaction(async tx => {
      const ticket = await this.lockTicket(tx, scene, digest);
      if (!ticket) return missing();
      if (ticket.status !== 'confirmed' || !ticket.userId || !ticket.miniSessionId) return conflict();
      const userId = ticket.userId;
      if (!await this.eligible(tx, userId, ticket.miniSessionId)) return denied();
      await tx.$executeRaw`DELETE FROM public.sessions WHERE user_id=${userId}::uuid AND expires_at<=clock_timestamp()`;
      if (await tx.session.count({ where: { userId } }) >= 20) return new HttpError(429, 'Session limit reached', 'SESSION_LIMIT');
      const changed = await tx.$executeRaw`UPDATE public.browser_login_tickets SET status='consumed'
        WHERE scene=${scene}::uuid AND expires_at > clock_timestamp() AND EXISTS
          (SELECT 1 FROM public.sessions WHERE id=${ticket.miniSessionId}::uuid AND expires_at > clock_timestamp())`;
      if (!changed) return missing();
      const token = issueToken();
      await tx.$executeRaw`INSERT INTO public.sessions(id,user_id,token_digest,label,channel,expires_at)
        VALUES (${randomUUID()}::uuid,${userId}::uuid,${tokenDigest(token)},'Mini confirmed browser','web',clock_timestamp()+interval '8 hours')`;
      return { userId, token };
    });
  }
}
