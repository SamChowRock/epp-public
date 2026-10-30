import { Module } from '@nestjs/common';
import { CapturesController } from './captures.controller.js';
import { CapturesService } from './captures.service.js';
import { CAPTURE_STORE } from './capture-store.js';
import type { CaptureStore } from './capture-store.js';
import { CaptureListQueryPipe } from './capture-query.js';
import { MemoryCaptureStore } from './memory-capture.store.js';
import { ObservedCaptureStore } from './observed-capture.store.js';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';

@Module({
  controllers: [CapturesController],
  providers: [
    CaptureListQueryPipe,
    MemoryCaptureStore,
    {
      provide: CAPTURE_STORE,
      useFactory: (store: MemoryCaptureStore, logger: AppLogger, state: ApplicationState) =>
        new ObservedCaptureStore(store, logger, state),
      inject: [MemoryCaptureStore, AppLogger, ApplicationState],
    },
    {
      provide: CapturesService,
      useFactory: (store: CaptureStore) => new CapturesService(store),
      inject: [CAPTURE_STORE],
    },
  ],
  exports: [CapturesService],
})
export class CapturesModule {}
