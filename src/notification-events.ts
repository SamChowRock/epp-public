import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { defer, repeat, Subscription } from 'rxjs';
import { ApplicationState } from './application-state.js';
import type { SessionIdentity } from './auth-context.js';
import { DatabaseService } from './database.service.js';
import { HttpError } from './http.js';

const pageSize = 20;

@Injectable()
export class NotificationEvents {
  private readonly owners = new Map<symbol, string>();

  constructor(private readonly database: DatabaseService, private readonly state: ApplicationState) {}

  private snapshot({ sessionId, userId }: SessionIdentity) {
    return this.state.track(() => this.database.run('notificationPageSnapshot', () =>
      this.database.client.$queryRaw<{ id: string | null; readAt: Date | null }[]>`
        SELECT page.id, page.read_at AS "readAt"
        FROM public.sessions s JOIN public.users u ON u.id=s.user_id
        LEFT JOIN LATERAL (
          SELECT n.id, n.read_at, n.created_at FROM public.notifications n
          WHERE n.user_id=s.user_id AND n.cleared_at IS NULL
          ORDER BY n.created_at DESC, n.id DESC LIMIT ${pageSize + 1}
        ) page ON true
        WHERE s.id=${sessionId}::uuid AND s.user_id=${userId}::uuid
          AND s.expires_at > clock_timestamp() AND u.status='active' AND u.web_enabled
        ORDER BY page.created_at DESC, page.id DESC
      `));
  }

  open(identity: SessionIdentity, response: Response): void {
    if (this.state.draining) throw new HttpError(503, 'Service is shutting down', 'SERVICE_DRAINING');
    const count = [...this.owners.values()].filter(owner => owner === identity.userId).length;
    if (this.owners.size >= 64 || count >= 4) throw new HttpError(429, 'Too many open streams', 'STREAM_LIMIT');
    if (response.destroyed) return;
    const slot = Symbol();
    this.owners.set(slot, identity.userId);
    response.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();

    let closed = false;
    let querying = false;
    let previous: string | undefined;
    let lastWrite = performance.now();
    const subscription = new Subscription();
    const close = () => {
      if (closed) return;
      closed = true;
      subscription.unsubscribe();
      if (!querying) this.owners.delete(slot);
      if (!response.destroyed && !response.writableEnded) response.end();
    };
    response.once('close', close);
    subscription.add(() => { response.off('close', close); });
    subscription.add(this.state.onDrain(close));
    subscription.add(defer(async () => {
      querying = true;
      try { return await this.snapshot(identity); }
      finally {
        querying = false;
        if (closed) this.owners.delete(slot);
      }
    }).pipe(repeat({ delay: 2000 })).subscribe({
      next: rows => {
        if (rows.length === 0) { close(); return; }
        // A live session with an empty inbox contributes one all-NULL placeholder.
        const items = rows.slice(0, pageSize).filter(row => row.id !== null);
        const stamp = JSON.stringify([items, rows.length > pageSize]);
        let frame: string;
        if (stamp !== previous) frame = 'event: inbox\ndata: refresh\n\n';
        else if (performance.now() - lastWrite >= 15000) frame = ': heartbeat\n\n';
        else return;
        previous = stamp;
        lastWrite = performance.now();
        if (!response.write(frame)) response.destroy();
      },
      error: () => close(),
    }));
  }
}
