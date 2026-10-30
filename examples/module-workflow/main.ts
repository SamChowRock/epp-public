import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CapturesModule } from '../../src/captures.module.js';
import { CapturesService } from '../../src/captures.service.js';
import type { Capture } from '../../src/capture.js';

function preview(capture: Capture): string {
  return `Original: ${capture.originalText}`;
}

class CreatePreview {
  constructor(private readonly captures: CapturesService) {}

  async run(text: string): Promise<string> {
    const capture = await this.captures.create(text);
    return preview(capture);
  }

  async forId(id: string): Promise<string> {
    return preview(await this.captures.find(id));
  }
}

@Module({
  imports: [CapturesModule],
  providers: [{
    provide: CreatePreview,
    useFactory: (captures: CapturesService) => new CreatePreview(captures),
    inject: [CapturesService],
  }],
})
class PreviewModule {}

const app = await NestFactory.createApplicationContext(PreviewModule, {
  logger: false, abortOnError: false,
});
try {
  const workflow = app.select(PreviewModule).get(CreatePreview, { strict: true });
  const captures = app.select(CapturesModule).get(CapturesService, { strict: true });
  console.log(await workflow.run('A preview is a consumer.'));
  const [saved] = await captures.list();
  if (!saved) throw new Error('Expected a saved capture');
  console.log(await workflow.forId(saved.id));
  console.log('stored count:', (await captures.list()).length);
} finally {
  await app.close();
}
