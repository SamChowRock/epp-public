import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_CONFIG } from './config.js';
import type { AppConfig } from './config.js';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';

@Module({})
export class RuntimeModule {
  static register(config: AppConfig, logger: AppLogger): DynamicModule {
    return {
      module: RuntimeModule,
      global: true,
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: AppLogger, useValue: logger },
        ApplicationState,
      ],
      exports: [APP_CONFIG, AppLogger, ApplicationState],
    };
  }
}
