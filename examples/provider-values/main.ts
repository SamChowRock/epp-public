import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CAPTURE_STORE } from '../../src/capture-store.js';
import type { CaptureStore } from '../../src/capture-store.js';
import { CapturesService } from '../../src/captures.service.js';

const fixedStore: CaptureStore = {
  async find(id) {
    return id === 'demo-capture' ? {
      id, originalText: 'A fixed example.', chineseIntent: null, createdAt: '2026-01-01T00:00:00.000Z',
    } : undefined;
  },
  async insert() { throw new Error('This example supports find only'); },
  async appendRevision() { throw new Error('This example supports find only'); },
  async revisions() { throw new Error('This example supports find only'); },
  async updateIntent() { throw new Error('This example supports find only'); },
  async list() { throw new Error('This example supports find only'); },
};

@Module({
  providers: [
    { provide: CAPTURE_STORE, useValue: fixedStore },
    {
      provide: CapturesService,
      useFactory: (store: CaptureStore) => new CapturesService(store),
      inject: [CAPTURE_STORE],
    },
  ],
})
class PreviewModule {}

const app = await NestFactory.createApplicationContext(PreviewModule, {
  logger: false, abortOnError: false,
});
try {
  console.log(await app.get(CapturesService).find('demo-capture'));
} finally {
  await app.close();
}
