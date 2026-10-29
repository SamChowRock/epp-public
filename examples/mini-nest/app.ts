import { MemoryCaptureStore } from '../../src/memory-capture.store.js';
import { Module, Controller, Get, Post, Body, Param, HttpError } from './framework.js';
import {
  CapturesService, InvalidCaptureError, CaptureNotFoundError,
} from '../../src/captures.service.js';

async function asHttp<T>(action: () => T | Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof InvalidCaptureError) throw new HttpError(400, error.message);
    if (error instanceof CaptureNotFoundError) throw new HttpError(404, error.message);
    throw error;
  }
}

// This small container supports class providers only; compose the store here.
class MiniCapturesService extends CapturesService {
  constructor() { super(new MemoryCaptureStore()); }
}

@Controller('/captures')
export class MiniCapturesController {
  constructor(private readonly captures: MiniCapturesService) {}

  @Get()
  async list() {
    return { items: await this.captures.list() };
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

@Module({ providers: [MiniCapturesService], controllers: [MiniCapturesController] })
export class MiniAppModule {}
