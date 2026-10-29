import { Module, Controller, Get, Post, Body, Param, HttpError } from './framework.js';
import {
  CapturesService, InvalidCaptureError, CaptureNotFoundError,
} from '../../src/captures.service.js';

function asHttp<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof InvalidCaptureError) throw new HttpError(400, error.message);
    if (error instanceof CaptureNotFoundError) throw new HttpError(404, error.message);
    throw error;
  }
}

@Controller('/captures')
export class MiniCapturesController {
  constructor(private readonly captures: CapturesService) {}

  @Get()
  list() {
    return { items: this.captures.list() };
  }

  @Post()
  create(@Body() body: unknown) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'Request body must be a JSON object');
    }
    return asHttp(() => this.captures.create(
      'originalText' in body ? body.originalText : undefined,
    ));
  }

  @Get('/:id')
  detail(@Param('id') id: string) {
    return asHttp(() => this.captures.find(id));
  }
}

@Module({ providers: [CapturesService], controllers: [MiniCapturesController] })
export class MiniAppModule {}
