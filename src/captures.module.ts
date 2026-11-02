import { Module } from '@nestjs/common';
import { CapturesController } from './captures.controller.js';
import { CapturesService } from './captures.service.js';
import { CAPTURE_STORE } from './capture-store.js';
import type { CaptureStore } from './capture-store.js';
import { CaptureListQueryPipe } from './capture-query.js';
import { DatabaseModule } from './database.module.js';
import { DatabaseService } from './database.service.js';
import { PrismaCaptureStore } from './prisma-capture.store.js';
import { ObservedCaptureStore } from './observed-capture.store.js';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';

@Module({
  imports: [DatabaseModule],
  controllers: [CapturesController],
  providers: [
    CaptureListQueryPipe,
    { provide: PrismaCaptureStore,
      useFactory: (database: DatabaseService) => new PrismaCaptureStore(database),
      inject: [DatabaseService] },
    {
      provide: CAPTURE_STORE,
      useFactory: (store: PrismaCaptureStore, logger: AppLogger, state: ApplicationState) =>
        new ObservedCaptureStore(store, logger, state),
      inject: [PrismaCaptureStore, AppLogger, ApplicationState],
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
