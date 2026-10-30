import 'reflect-metadata';
import { Body, Controller, Inject, Injectable, Module, Post } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { mkdtemp, open, rm } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { APP_CONFIG } from '../config.js';
import type { AppConfig } from '../config.js';
import { RuntimeModule } from '../runtime.module.js';
import { ApplicationState } from '../application-state.js';
import { AppLogger } from '../app-logger.js';
import { ProblemFilter } from '../problem.filter.js';
import { requestObservation } from '../request-observation.js';
import { parseInput } from '../input-validation.js';

const Input = z.object({
  delayMs: z.number().int().min(0).max(15000).default(1500),
  fail: z.boolean().default(false),
});
export type LabMode = 'normal' | 'init-fail' | 'close-hang';

export async function createLifecycleApp(config: AppConfig, logger: AppLogger, mode: LabMode) {
  @Injectable()
  class Resource {
    private directory?: string;
    private handle?: FileHandle;
    constructor(
      @Inject(APP_CONFIG) private readonly config: AppConfig,
      @Inject(AppLogger) private readonly log: AppLogger,
    ) {}
    async onModuleInit(): Promise<void> {
      this.directory = await mkdtemp(join(tmpdir(), 'epp-lifecycle-'));
      try {
        this.handle = await open(join(this.directory, 'events.log'), 'wx', 0o600);
        if (mode === 'init-fail') throw new Error('Demonstration initialization failure');
        this.log.write('info', 'resource.opened', { port: this.config.port });
      } catch (error) {
        await this.release();
        throw error;
      }
    }
    async use(ms: number, fail: boolean): Promise<void> {
      await delay(ms);
      if (fail) throw new Error('Demonstration resource failure');
      if (!this.handle) throw new Error('Resource already closed');
      await this.handle.writeFile('completed\n');
      this.log.write('info', 'resource.used');
    }
    private async release(): Promise<void> {
      await this.handle?.close();
      this.handle = undefined;
      if (this.directory) await rm(this.directory, { recursive: true, force: true });
      this.directory = undefined;
    }
    async onModuleDestroy(): Promise<void> {
      if (mode === 'close-hang') await new Promise<void>(() => {});
      await this.release();
      this.log.write('info', 'resource.closed');
    }
  }
  @Controller('lifecycle')
  class LifecycleController {
    constructor(
      @Inject(Resource) private readonly resource: Resource,
      @Inject(ApplicationState) private readonly state: ApplicationState,
    ) {}
    @Post('work')
    async work(@Body() body: unknown) {
      const value = parseInput(Input, body);
      await this.state.track(() => this.resource.use(value.delayMs, value.fail));
      return { completed: true };
    }
  }
  @Module({
    imports: [RuntimeModule.register(config, logger)],
    controllers: [LifecycleController],
    providers: [Resource, { provide: APP_FILTER, useClass: ProblemFilter }],
  })
  class LifecycleModule {}
  const app = await NestFactory.create(LifecycleModule, { logger: false, abortOnError: false });
  app.use(requestObservation(logger, app.get(ApplicationState), ['/lifecycle/work']));
  return app;
}
