import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { z } from 'zod';
import { ApplicationState } from './application-state.js';
import { CURRENT_USER_ID } from './auth-context.js';
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
    @Inject(CURRENT_USER_ID) private readonly userId: string, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

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
