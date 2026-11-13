import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { AppLogger } from './app-logger.js';
import { ConfigError, logLevelSchema, parseMailEndpoint } from './config.js';
import { parseDatabaseConfig } from './database-config.js';
import { DatabaseService } from './database.service.js';
import { LocalMailDelivery } from './verification-delivery.js';

@Module({})
export class MailWorkerModule {
  static register(env: NodeJS.ProcessEnv, notifications = false): DynamicModule {
    const level = logLevelSchema.safeParse(env.LOG_LEVEL);
    if (!level.success) throw new ConfigError('LOG_LEVEL');
    const mailProviders = [];
    if (!notifications) {
      const endpoint = parseMailEndpoint(env);
      mailProviders.push({
        provide: LocalMailDelivery,
        useFactory: () => new LocalMailDelivery(endpoint),
      });
    }
    const database = parseDatabaseConfig(env);
    return {
      module: MailWorkerModule,
      providers: [
        { provide: AppLogger, useValue: new AppLogger(level.data) },
        { provide: DatabaseService, inject: [AppLogger],
          useFactory: (logger: AppLogger) => new DatabaseService(database, logger, notifications ? 'epp-notifications' : 'epp-worker') },
        ...mailProviders,
      ],
    };
  }
}
