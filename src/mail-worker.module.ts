import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { z } from 'zod';
import { AppLogger } from './app-logger.js';
import { ConfigError, mailHostSchema, mailPortSchema } from './config.js';
import { parseDatabaseConfig } from './database-config.js';
import { DatabaseService } from './database.service.js';
import { LocalMailDelivery } from './verification-delivery.js';

const workerEnvironment = z.object({
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

@Module({})
export class MailWorkerModule {
  static register(env: NodeJS.ProcessEnv, notifications = false): DynamicModule {
    const options = workerEnvironment.safeParse(env);
    if (!options.success) throw new ConfigError(String(options.error.issues[0]?.path[0]));
    const { LOG_LEVEL } = options.data;
    const mailProviders = [];
    if (!notifications) {
      const port = mailPortSchema.safeParse(env.LOCAL_SMTP_PORT);
      if (!port.success) throw new ConfigError('LOCAL_SMTP_PORT');
      const host = mailHostSchema.safeParse(env.LOCAL_SMTP_HOST);
      if (!host.success) throw new ConfigError('LOCAL_SMTP_HOST');
      mailProviders.push({
        provide: LocalMailDelivery,
        useFactory: () => new LocalMailDelivery({ localSmtpPort: port.data, localSmtpHost: host.data }),
      });
    }
    const database = parseDatabaseConfig(env);
    return {
      module: MailWorkerModule,
      providers: [
        { provide: AppLogger, useValue: new AppLogger(LOG_LEVEL) },
        { provide: DatabaseService, inject: [AppLogger],
          useFactory: (logger: AppLogger) => new DatabaseService(database, logger, notifications ? 'epp-notifications' : 'epp-worker') },
        ...mailProviders,
      ],
    };
  }
}
