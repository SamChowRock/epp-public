import { Module } from '@nestjs/common';
import { CapturesController } from './captures.controller.js';
import { CapturesService } from './captures.service.js';
import { CAPTURE_STORE } from './capture-store.js';
import type { CaptureStore } from './capture-store.js';
import { CaptureListQueryPipe } from './capture-query.js';
import { MemoryCaptureStore } from './memory-capture.store.js';

@Module({
  controllers: [CapturesController],
  providers: [
    CaptureListQueryPipe,
    { provide: CAPTURE_STORE, useClass: MemoryCaptureStore },
    {
      provide: CapturesService,
      useFactory: (store: CaptureStore) => new CapturesService(store),
      inject: [CAPTURE_STORE],
    },
  ],
  exports: [CapturesService],
})
export class CapturesModule {}
