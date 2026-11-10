import { NotificationsController } from './notifications.controller.js';
import { AuthModule } from './auth.module.js';
import { CURRENT_USER_ID } from './auth-context.js';
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
  imports: [DatabaseModule, AuthModule],
  controllers: [CapturesController, CandidatesController, LearningController, NotificationsController],
  providers: [
    { provide: LearningQueries,
      useFactory: (database: DatabaseService, state: ApplicationState, config: AppConfig, userId: string) => new LearningQueries(database, state, config.cursorKey, userId),
      inject: [DatabaseService, ApplicationState, APP_CONFIG, CURRENT_USER_ID] },
    { provide: PrismaCandidateStore,
      useFactory: (database: DatabaseService, userId: string) => new PrismaCandidateStore(database, userId),
      inject: [DatabaseService, CURRENT_USER_ID] },
    { provide: CandidatesService,
      useFactory: (store: PrismaCandidateStore, state: ApplicationState) => new CandidatesService(store, state),
      inject: [PrismaCandidateStore, ApplicationState] },
    CaptureListQueryPipe,
    { provide: PrismaCaptureStore,
      useFactory: (database: DatabaseService, userId: string) => new PrismaCaptureStore(database, userId),
      inject: [DatabaseService, CURRENT_USER_ID] },
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
