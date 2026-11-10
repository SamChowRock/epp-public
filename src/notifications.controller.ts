import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req, Res, UseInterceptors } from '@nestjs/common';
import { z } from 'zod';
import { ApplicationState } from './application-state.js';
import { NotificationEvents } from './notification-events.js';
import type { Response } from 'express';
import { HttpError } from './http.js';
import { CURRENT_USER_ID, requireSession, type AuthenticatedRequest } from './auth-context.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { DatabaseService } from './database.service.js';
import { EmptyObjectSchema } from './candidate-contract.js';
import { NotificationPage, NotificationQuery, type InboxQuery } from './notification-contract.js';
import { pageRequest, pageResult } from './pagination.js';
import { ResponseSchemaInterceptor } from './response-schema.interceptor.js';
import { SchemaPipe } from './schema.pipe.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly database: DatabaseService, private readonly state: ApplicationState,
    private readonly streams: NotificationEvents,
    @Inject(CURRENT_USER_ID) private readonly userId: string, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get('events')
  events(@Req() request: AuthenticatedRequest, @Res() response: Response,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object): void {
    const origin = request.headers.origin;
    const site = request.headers['sec-fetch-site'];
    if ((origin !== undefined && origin !== this.config.appOrigin)
      || (site !== undefined && site !== 'same-origin' && site !== 'none')) {
      throw new HttpError(403, 'Request origin is not allowed', 'ORIGIN_REJECTED');
    }
    this.streams.open(requireSession(request), response);
  }

  @Get()
  @UseInterceptors(new ResponseSchemaInterceptor(NotificationPage))
  list(@Query(new SchemaPipe(NotificationQuery)) query: InboxQuery) {
    const page = pageRequest({ ...query, mode: 'cursor' }, 'notifications', this.userId, this.config.cursorKey);
    return this.state.track(() => this.database.run('listNotifications', async () => {
      const rows = await this.database.client.notification.findMany({
        where: { userId: this.userId, clearedAt: null, ...page.where },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: page.limit + 1,
        select: { id: true, kind: true, createdAt: true, readAt: true },
      });
      const items = rows.slice(0, page.limit).map(row => ({
        ...row, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null,
      }));
      return { items, ...pageResult(page, rows, this.config.cursorKey) };
    }));
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@Param('id', new SchemaPipe(z.uuid())) id: string,
    @Body(new SchemaPipe(EmptyObjectSchema)) _body: object,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    await this.state.track(() => this.database.run('readNotification', () => this.database.client.$executeRaw`
      UPDATE public.notifications SET read_at=clock_timestamp()
      WHERE user_id=${this.userId}::uuid AND id=${id}::uuid AND read_at IS NULL AND cleared_at IS NULL`));
  }

  @Delete(':id')
  @HttpCode(204)
  async clear(@Param('id', new SchemaPipe(z.uuid())) id: string,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    await this.state.track(() => this.database.run('clearNotification', () => this.database.client.$executeRaw`
      UPDATE public.notifications SET cleared_at=clock_timestamp()
      WHERE user_id=${this.userId}::uuid AND id=${id}::uuid AND cleared_at IS NULL`));
  }
}
