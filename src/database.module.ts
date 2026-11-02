import { Module } from '@nestjs/common';
import { ConfigError } from './config.js';
import { AppLogger } from './app-logger.js';
import { DATABASE_CONFIG, parseDatabaseConfig } from './database-config.js';
import type { DatabaseConfig } from './database-config.js';
import { DatabaseService } from './database.service.js';

@Module({
  providers: [
    { provide: DATABASE_CONFIG,
      useFactory: (logger: AppLogger) => {
        try { return parseDatabaseConfig(process.env); }
        catch (error) {
          logger.write('error', 'database.start_failed', {
            code: 'CONFIG_INVALID', field: error instanceof ConfigError ? error.field : undefined,
          });
          throw error;
        }
      }, inject: [AppLogger] },
    { provide: DatabaseService,
      useFactory: (config: DatabaseConfig, logger: AppLogger) => new DatabaseService(config, logger),
      inject: [DATABASE_CONFIG, AppLogger] },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
