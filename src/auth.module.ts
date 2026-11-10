import { AvatarObjects } from './avatar-objects.js';
import { AvatarPublication } from './avatar-publication.js';
import { AvatarController } from './avatar.controller.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';
import { RecoveryController } from './recovery.controller.js';
import { RecoveryService } from './recovery.service.js';
import { Module, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { DatabaseModule } from './database.module.js';
import { DatabaseService } from './database.service.js';
import { ApplicationState } from './application-state.js';
import { AuthController } from './auth.controller.js';
import { SessionService } from './session.service.js';
import { CURRENT_USER_ID, requireSession } from './auth-context.js';
import type { AuthenticatedRequest } from './auth-context.js';

@Module({
  imports: [DatabaseModule], controllers: [AuthController, RecoveryController, ProfileController, AvatarController],
  providers: [
    AvatarObjects, AvatarPublication, ProfileService,
    { provide: RecoveryService, useFactory: (db: DatabaseService, sessions: SessionService,
      state: ApplicationState) =>
      new RecoveryService(db, sessions, state),
      inject: [DatabaseService, SessionService, ApplicationState] },
    { provide: SessionService, useFactory: (db: DatabaseService, state: ApplicationState) => new SessionService(db, state),
      inject: [DatabaseService, ApplicationState] },
    { provide: CURRENT_USER_ID, scope: Scope.REQUEST,
      useFactory: (request: AuthenticatedRequest) => requireSession(request).userId, inject: [REQUEST] },
  ],
  exports: [SessionService, CURRENT_USER_ID],
})
export class AuthModule {}
