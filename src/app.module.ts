import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ProblemFilter } from './problem.filter.js';
import { CapturesModule } from './captures.module.js';
import { RuntimeModule } from './runtime.module.js';
import type { AppConfig } from './config.js';
import { AppLogger } from './app-logger.js';

@Module({})
export class AppModule {
  static register(config: AppConfig, logger: AppLogger): DynamicModule {
    return {
      module: AppModule,
      imports: [RuntimeModule.register(config, logger), CapturesModule],
      providers: [{ provide: APP_FILTER, useClass: ProblemFilter }],
    };
  }
}
