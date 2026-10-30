import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CapturesModule } from '../../src/captures.module.js';
import { CapturesService } from '../../src/captures.service.js';

class CaptureActions {
  constructor(
    private readonly captures: CapturesService,
    private readonly previews: Preview,
  ) {}

  find(id: string) { return this.captures.find(id); }

  async createAndPreview(text: string) {
    const capture = await this.captures.create(text);
    return this.previews.forId(capture.id);
  }
}

class Preview {
  constructor(private readonly actions: CaptureActions) {}

  async forId(id: string) {
    const capture = await this.actions.find(id);
    return `Original: ${capture.originalText}`;
  }
}

@Module({
  imports: [CapturesModule],
  providers: [
    {
      provide: CaptureActions,
      useFactory: (captures: CapturesService, preview: Preview) => new CaptureActions(captures, preview),
      inject: [CapturesService, Preview],
    },
    {
      provide: Preview,
      useFactory: (actions: CaptureActions) => new Preview(actions),
      inject: [CaptureActions],
    },
  ],
})
class CycleModule {}

try {
  const app = await NestFactory.createApplicationContext(CycleModule, {
    logger: false, abortOnError: false,
  });
  await app.close();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
