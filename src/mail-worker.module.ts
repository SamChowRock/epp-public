import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { z } from 'zod';
import { AppLogger } from './app-logger.js';
import { ConfigError, mailPortSchema } from './config.js';
import { parseDatabaseConfig } from './database-config.js';
import { DatabaseService } from './database.service.js';
import { LocalMailDelivery } from './verification-delivery.js';

const workerEnvironment = z.object({
  LOCAL_SMTP_PORT: mailPortSchema,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

@Module({})
export class MailWorkerModule {
  static register(env: NodeJS.ProcessEnv): DynamicModule {
    const options = workerEnvironment.safeParse(env);
    if (!options.success) throw new ConfigError(String(options.error.issues[0]?.path[0]));
    const { LOG_LEVEL, LOCAL_SMTP_PORT } = options.data;
    const database = parseDatabaseConfig(env);
    return {
      module: MailWorkerModule,
      providers: [
        { provide: AppLogger, useValue: new AppLogger(LOG_LEVEL) },
        { provide: DatabaseService, inject: [AppLogger],
          useFactory: (logger: AppLogger) => new DatabaseService(database, logger, 'epp-worker') },
        { provide: LocalMailDelivery, useFactory: () => new LocalMailDelivery({ localSmtpPort: LOCAL_SMTP_PORT }) },
      ],
    };
  }
}
