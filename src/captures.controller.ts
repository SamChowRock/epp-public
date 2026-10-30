import { Body, Controller, Get, Param, Post, Query, Res, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { CapturesService } from './captures.service.js';
import type { CaptureListOptions } from './capture.js';
import { CaptureListQueryPipe } from './capture-query.js';
import { CaptureListResponseSchema, CaptureResponseSchema, CreateCaptureSchema } from './capture-contract.js';
import type { CreateCaptureInput } from './capture-contract.js';
import { SchemaPipe } from './schema.pipe.js';
import { ResponseSchemaInterceptor } from './response-schema.interceptor.js';

@Controller('captures')
export class CapturesController {
  constructor(private readonly captures: CapturesService) {}

  @Get()
  @UseInterceptors(new ResponseSchemaInterceptor(CaptureListResponseSchema))
  async list(@Query(CaptureListQueryPipe) options: CaptureListOptions) {
    return { items: await this.captures.list(options) };
  }

  @Post()
  @UseInterceptors(new ResponseSchemaInterceptor(CaptureResponseSchema))
  async create(
    @Body(new SchemaPipe(CreateCaptureSchema)) input: CreateCaptureInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const capture = await this.captures.create(input.originalText);
    response.setHeader('Location', `/captures/${capture.id}`);
    return capture;
  }

  @Get(':id')
  @UseInterceptors(new ResponseSchemaInterceptor(CaptureResponseSchema))
  detail(@Param('id') id: string) {
    return this.captures.find(id);
  }
}
