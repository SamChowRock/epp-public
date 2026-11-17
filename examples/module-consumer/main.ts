import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CapturesModule } from '../../src/captures.module.js';
import { RuntimeModule } from '../../src/runtime.module.js';
import { parseConfig } from '../../src/config.js';
import { AppLogger } from '../../src/app-logger.js';
import { CapturesService } from '../../src/captures.service.js';

class CaptureSummary {
  constructor(private readonly captures: CapturesService) {}

  async lines(): Promise<string[]> {
    const captures = await this.captures.list();
    return captures.map(capture => capture.originalText);
  }
}

@Module({
  imports: [RuntimeModule.register(parseConfig({ port: 3000 }, { NODE_ENV: 'test' }), new AppLogger('error')), CapturesModule],
  providers: [{
    provide: CaptureSummary,
    useFactory: (captures: CapturesService) => new CaptureSummary(captures),
    inject: [CapturesService],
  }],
})
class SummaryModule {}

const app = await NestFactory.createApplicationContext(SummaryModule, {
  logger: false, abortOnError: false,
});
try {
  const captures = app.select(CapturesModule).get(CapturesService, { strict: true });
  const summary = app.select(SummaryModule).get(CaptureSummary, { strict: true });
  await captures.create('One module owns the records.');
  console.log(await summary.lines());
} finally {
  await app.close();
}
