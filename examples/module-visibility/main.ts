import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CAPTURE_STORE } from '../../src/capture-store.js';
import type { CaptureStore } from '../../src/capture-store.js';
import { CapturesService } from '../../src/captures.service.js';
import { MemoryCaptureStore } from '../../src/memory-capture.store.js';

const mode = process.argv[2] ?? 'shared';
if (!['shared', 'hidden', 'root-only', 'private', 'duplicate', 'bridge', 'reexport'].includes(mode)) {
  throw new Error('Unknown mode');
}
const serviceProvider = {
  provide: CapturesService,
  useFactory: (store: CaptureStore) => new CapturesService(store),
  inject: [CAPTURE_STORE],
};
const storeProvider = { provide: CAPTURE_STORE, useClass: MemoryCaptureStore };

@Module({
  providers: [storeProvider, serviceProvider],
  exports: mode === 'hidden' ? [] : [CapturesService],
})
class RecordsModule {}

@Module({
  imports: [RecordsModule],
  exports: mode === 'reexport' ? [RecordsModule] : [],
})
class BridgeModule {}

class Reader {
  constructor(readonly captures: CapturesService) {}
}
@Module({
  imports: mode === 'root-only' ? []
    : [mode === 'bridge' || mode === 'reexport' ? BridgeModule : RecordsModule],
  providers: [
    ...(mode === 'duplicate' ? [storeProvider, serviceProvider] : []),
    {
      provide: Reader,
      useFactory: (captures: CapturesService) => new Reader(captures),
      inject: [CapturesService],
    },
    ...(mode === 'private' ? [{
      provide: 'DIRECT_STORE',
      useFactory: (store: CaptureStore) => store,
      inject: [CAPTURE_STORE],
    }] : []),
  ],
})
class ReaderModule {}

@Module({ imports: [RecordsModule, ReaderModule] })
class RootModule {}

try {
  const app = await NestFactory.createApplicationContext(RootModule, {
    logger: false, abortOnError: false,
  });
  try {
    const owner = app.select(RecordsModule).get(CapturesService, { strict: true });
    const reader = app.select(ReaderModule).get(Reader, { strict: true });
    await owner.create('Written through the owner.');
    console.log('same service:', owner === reader.captures);
    console.log('owner count:', (await owner.list()).length);
    console.log('reader count:', (await reader.captures.list()).length);
  } finally {
    await app.close();
  }
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
