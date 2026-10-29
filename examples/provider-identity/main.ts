import 'reflect-metadata';
import { Inject, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CAPTURE_STORE } from '../../src/capture-store.js';
import type { CaptureStore } from '../../src/capture-store.js';
import { MemoryCaptureStore } from '../../src/memory-capture.store.js';

const mode = process.argv[2] ?? 'alias';
if (!['alias', 'class', 'wrong-token', 'missing', 'fail-factory'].includes(mode)) {
  throw new Error('Unknown mode');
}
const requestedToken = mode === 'wrong-token' ? Symbol('CAPTURE_STORE') : CAPTURE_STORE;
const READY_STORE = Symbol('READY_STORE');
const SEED = Symbol('SEED');

@Injectable()
class Reader {
  constructor(@Inject(requestedToken) readonly store: CaptureStore) {}
}

@Module({
  providers: [
    MemoryCaptureStore,
    { provide: SEED, useValue: { text: 'Ready before use.' } },
    ...(mode === 'missing' ? [] : [{
      provide: CAPTURE_STORE,
      ...(mode === 'class'
        ? { useClass: MemoryCaptureStore }
        : { useExisting: MemoryCaptureStore }),
    }]),
    {
      provide: READY_STORE,
      useFactory: async (store: CaptureStore, seed: { text: string }) => {
        if (mode === 'fail-factory') throw new Error('Seed preparation failed');
        await store.insert({
          id: 'seed', originalText: seed.text, createdAt: '2026-01-01T00:00:00.000Z',
        });
        return store;
      },
      inject: [CAPTURE_STORE, SEED],
    },
    Reader,
  ],
})
class IdentityModule {}

try {
  const app = await NestFactory.createApplicationContext(IdentityModule, {
    logger: false, abortOnError: false,
  });
  try {
    const concrete = app.get(MemoryCaptureStore);
    const reader = app.get(Reader);
    const ready = app.get<CaptureStore>(READY_STORE);
    console.log('same instance:', concrete === reader.store);
    console.log('ready is injected store:', ready === reader.store);
    console.log('concrete count:', (await concrete.list({})).length);
    console.log('ready count:', (await ready.list({})).length);
    console.log('design type:', Reflect.getMetadata('design:paramtypes', Reader)[0].name);
  } finally {
    await app.close();
  }
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
