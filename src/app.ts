import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { captureBody } from './capture-body.js';
import { httpBoundary } from './http-boundary.js';
import { SwaggerModule } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi.js';
import { readHttpOptions } from './http-options.js';

export async function createApp(): Promise<NestExpressApplication> {
  const { docsEnabled } = readHttpOptions();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    abortOnError: false,
  });
  app.set('query parser', 'simple');
  if (docsEnabled) {
    SwaggerModule.setup('docs', app, createOpenApiDocument(), {
      jsonDocumentUrl: 'openapi.json', raw: ['json'],
      swaggerOptions: { validatorUrl: null },
    });
  }
  app.use(httpBoundary);
  app.use(captureBody);
  return app;
}
