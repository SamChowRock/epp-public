import { OidcController } from './oidc.controller.js';
import { MiniController } from './mini.controller.js';
import { MiniService } from './mini.service.js';
import { WechatLogin } from './wechat-login.js';
import { RecoveryController } from './recovery.controller.js';
import { RecoveryService } from './recovery.service.js';
import { LocalMailDelivery } from './verification-delivery.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { AppLogger } from './app-logger.js';
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
  imports: [DatabaseModule], controllers: [AuthController, RecoveryController, MiniController, OidcController],
  providers: [
    { provide: MiniService, useFactory: (db: DatabaseService, sessions: SessionService,
      state: ApplicationState, config: AppConfig) => new MiniService(db, sessions, state, new WechatLogin(config.wechat)),
      inject: [DatabaseService, SessionService, ApplicationState, APP_CONFIG] },
    { provide: RecoveryService, useFactory: (db: DatabaseService, sessions: SessionService,
      state: ApplicationState, config: AppConfig, logger: AppLogger) =>
      new RecoveryService(db, sessions, state, new LocalMailDelivery(config), logger),
      inject: [DatabaseService, SessionService, ApplicationState, APP_CONFIG, AppLogger] },
    { provide: SessionService, useFactory: (db: DatabaseService, state: ApplicationState) => new SessionService(db, state),
      inject: [DatabaseService, ApplicationState] },
    { provide: CURRENT_USER_ID, scope: Scope.REQUEST,
      useFactory: (request: AuthenticatedRequest) => requireSession(request).userId, inject: [REQUEST] },
  ],
  exports: [SessionService, CURRENT_USER_ID],
})
export class AuthModule {}
