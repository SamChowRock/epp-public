import { Catch, Inject } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { httpFailure, sendJson } from './http.js';
import { AppLogger } from './app-logger.js';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(@Inject(AppLogger) private readonly logger: AppLogger) {}
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.destroyed || response.writableEnded) return;
    if (response.headersSent) {
      this.logger.write('error', 'http.failed', { code: 'RESPONSE_ALREADY_STARTED' });
      response.destroy();
      return;
    }
    // A failed response must not advertise the success-only resource location.
    response.removeHeader('Location');
    const failure = httpFailure(error);
    this.logger.write(failure.statusCode >= 500 ? 'error' : 'warn', 'http.failed', {
      status: failure.statusCode, code: failure.body.code,
    });
    sendJson(response, failure.statusCode, failure.body, {
      'Content-Type': 'application/problem+json; charset=utf-8',
    });
  }
}
