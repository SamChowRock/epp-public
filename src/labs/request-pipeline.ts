import 'reflect-metadata';
import { Body, Catch, Controller, Injectable, Module, Post, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import type { ArgumentsHost, CallHandler, CanActivate, ExecutionContext, NestInterceptor, PipeTransform } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { catchError, finalize, map, of, tap, throwError } from 'rxjs';
import { z } from 'zod';
import { HttpError } from '../http.js';
import { ProblemFilter } from '../problem.filter.js';

const ValueSchema = z.object({ value: z.string().min(1) });
type Value = z.infer<typeof ValueSchema>;
type RecordStep = (step: string) => void;

// Each call creates an isolated demonstration application, never mounted in AppModule.
export async function createPipelineApp(record: RecordStep = console.log) {
  @Injectable()
  class DemoGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      record('guard');
      const request = context.switchToHttp().getRequest<Request>();
      return request.headers['x-demo-block'] !== '1';
    }
  }

  class DemoPipe implements PipeTransform<unknown, Value> {
    transform(value: unknown): Value {
      record('pipe');
      const parsed = ValueSchema.safeParse(value);
      if (!parsed.success) throw new HttpError(400, 'value must be a non-empty string', 'LAB_INPUT');
      return parsed.data;
    }
  }

  class TraceInterceptor implements NestInterceptor {
    constructor(private readonly name: 'outer' | 'inner') {}

    intercept(context: ExecutionContext, next: CallHandler) {
      record(`${this.name}:before`);
      const request = context.switchToHttp().getRequest<Request>();
      if (this.name === 'inner' && request.headers['x-demo-short'] === '1') {
        record('inner:short');
        return of({ value: 'short-circuit' });
      }
      return next.handle().pipe(
        map(value => this.name === 'inner' ? ValueSchema.parse(value) : value),
        tap({
          next: () => record(`${this.name}:next`),
          error: () => record(`${this.name}:error`),
        }),
        catchError((error: unknown) => {
          if (this.name === 'inner' && request.headers['x-demo-recover'] === '1') {
            record('inner:recover');
            return of({ value: 'recovered' });
          }
          return throwError(() => error);
        }),
        finalize(() => record(`${this.name}:finalize`)),
      );
    }
  }

  @Catch()
  class TraceFilter extends ProblemFilter {
    constructor(private readonly name: string) { super(); }

    override catch(error: unknown, host: ArgumentsHost): void {
      record(`filter:${this.name}`);
      super.catch(error, host);
    }
  }

  @Controller('pipeline')
  @UseGuards(DemoGuard)
  @UseInterceptors(new TraceInterceptor('inner'))
  class PipelineController {
    @Post()
    run(@Body(new DemoPipe()) input: Value) {
      record('handler');
      if (input.value === 'fail') throw new Error('demonstration failure');
      if (input.value === 'bad-output') return { value: 7 };
      return { value: input.value, internalNote: 'not public' };
    }

    @Post('local-filter')
    @UseFilters(new TraceFilter('route'))
    localFilter(@Body(new DemoPipe()) input: Value) {
      record('handler');
      throw new HttpError(409, `Demonstration conflict: ${input.value}`, 'LAB_CONFLICT');
    }
  }

  @Module({ controllers: [PipelineController], providers: [DemoGuard] })
  class PipelineModule {}

  const app = await NestFactory.create<NestExpressApplication>(PipelineModule, {
    logger: false, abortOnError: false,
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    record('middleware');
    response.once('finish', () => record(`finish:${response.statusCode}`));
    response.once('close', () => record(`close:${response.writableFinished}`));
    if (request.headers['x-demo-middleware-error'] === '1') {
      next(new HttpError(400, 'Demonstration middleware failure', 'LAB_MIDDLEWARE'));
      return;
    }
    next();
  });
  app.useGlobalInterceptors(new TraceInterceptor('outer'));
  app.useGlobalFilters(new TraceFilter('global'));
  return app;
}
