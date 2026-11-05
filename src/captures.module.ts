import { APP_CONFIG } from './config.js';
import type { AppConfig } from './config.js';
import { LearningController } from './learning.controller.js';
import { LearningQueries } from './learning.queries.js';
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
import { CandidatesController } from './candidates.controller.js';
import { CandidatesService } from './candidates.service.js';
import { PrismaCandidateStore } from './prisma-candidate.store.js';

@Module({
  imports: [DatabaseModule],
  controllers: [CapturesController, CandidatesController, LearningController],
  providers: [
    { provide: LearningQueries,
      useFactory: (database: DatabaseService, state: ApplicationState, config: AppConfig) => new LearningQueries(database, state, config.cursorKey),
      inject: [DatabaseService, ApplicationState, APP_CONFIG] },
    { provide: PrismaCandidateStore,
      useFactory: (database: DatabaseService) => new PrismaCandidateStore(database),
      inject: [DatabaseService] },
    { provide: CandidatesService,
      useFactory: (store: PrismaCandidateStore, state: ApplicationState) => new CandidatesService(store, state),
      inject: [PrismaCandidateStore, ApplicationState] },
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
