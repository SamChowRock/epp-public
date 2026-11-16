import { Module } from '@nestjs/common';
import { CapturesController } from '../../captures.controller.js';
import { CapturesService } from '../../captures.service.js';
import { CAPTURE_STORE } from '../../capture-store.js';
import type { CaptureStore } from '../../capture-store.js';
import { CaptureListQueryPipe } from '../../capture-query.js';
import { JsonFileStore, readRows } from './store.js';
import { resolve } from 'node:path';
import { ObservedCaptureStore } from '../../observed-capture.store.js';
import { AppLogger } from '../../app-logger.js';
import { ApplicationState } from '../../application-state.js';

@Module({
  controllers: [CapturesController],
  providers: [
    CaptureListQueryPipe,
    { provide: JsonFileStore, useFactory: async () => {
      if (!process.env.JSON_FILE) throw new Error('JSON_FILE required');
      const file = resolve(process.env.JSON_FILE);
      await readRows(file); // Refuse missing, malformed or invalid data before listen.
      return new JsonFileStore(file);
    } },
    {
      provide: CAPTURE_STORE,
      useFactory: (store: JsonFileStore, logger: AppLogger, state: ApplicationState) =>
        new ObservedCaptureStore(store, logger, state),
      inject: [JsonFileStore, AppLogger, ApplicationState],
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
