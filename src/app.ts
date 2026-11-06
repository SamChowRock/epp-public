import { authRateLimit, browserBoundary } from './browser-security.js';
import { SessionService } from './session.service.js';
import { privateResponses, sessionBoundary, sessionCookieName } from './session-http.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { captureBody } from './capture-body.js';
import { httpBoundary } from './http-boundary.js';
import { SwaggerModule } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi.js';
import { loadConfig } from './config.js';
import type { AppConfig } from './config.js';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';
import { requestObservation } from './request-observation.js';

export async function createApp(
  config?: AppConfig,
  logger?: AppLogger,
): Promise<NestExpressApplication> {
  config ??= await loadConfig();
  logger ??= new AppLogger(config.logLevel);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config, logger), {
    logger: false,
    bodyParser: false,
    abortOnError: false,
  });
  app.set('query parser', 'simple');
  app.set('trust proxy', config.trustedProxyIps.length ? [...config.trustedProxyIps] : false);
  app.disable('x-powered-by');
  app.use(requestObservation(logger, app.get(ApplicationState)));
  app.use(privateResponses);
  app.use(browserBoundary(config));
  if (config.docsEnabled) {
    SwaggerModule.setup('docs', app, createOpenApiDocument(sessionCookieName(config)), {
      jsonDocumentUrl: 'openapi.json', raw: ['json'],
      swaggerOptions: { validatorUrl: null },
    });
  }
  app.use(httpBoundary);
  app.use(authRateLimit());
  app.use(sessionBoundary(app.get(SessionService), config));
  app.use(captureBody);
  return app;
}
