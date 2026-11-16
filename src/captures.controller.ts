import { CapturePages, CapturePageQuerySchema, CapturePageSchema } from './capture-pages.js';
import type { CapturePageQuery } from './capture-pages.js';
import { Body, Headers, Controller, Get, Param, Patch, Post, Query, Res, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { CaptureCommands } from './capture-commands.js';
import { CapturesService } from './captures.service.js';
import type { CaptureListOptions } from './capture.js';
import { CaptureListQueryPipe } from './capture-query.js';
import { CaptureListResponseSchema, CaptureResponseSchema, CreateCaptureSchema, UpdateCaptureIntentSchema } from './capture-contract.js';
import type { CreateCaptureInput, UpdateCaptureIntentInput } from './capture-contract.js';
import { AppendRevisionSchema, RevisionResponseSchema, RevisionPageSchema, RevisionQuerySchema } from './capture-contract.js';
import type { AppendRevisionInput } from './capture-contract.js';
import type { z } from 'zod';
import { SchemaPipe } from './schema.pipe.js';
import { ResponseSchemaInterceptor } from './response-schema.interceptor.js';

@Controller('captures')
export class CapturesController {
  constructor(private readonly captures: CapturesService, private readonly commands: CaptureCommands, private readonly pages: CapturePages) {}

  @Get('page')
  @UseInterceptors(new ResponseSchemaInterceptor(CapturePageSchema))
  page(@Query(new SchemaPipe(CapturePageQuerySchema)) query: CapturePageQuery) {
    return this.pages.list(query);
  }

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
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const capture = key === undefined ? await this.captures.create(input.originalText, input.chineseIntent)
      : await this.commands.create(key, input);
    response.setHeader('Location', `/captures/${capture.id}`);
    return capture;
  }

  @Patch(':id')
  @UseInterceptors(new ResponseSchemaInterceptor(CaptureResponseSchema))
  updateIntent(
    @Param('id') id: string,
    @Body(new SchemaPipe(UpdateCaptureIntentSchema)) input: UpdateCaptureIntentInput,
  ) {
    return this.captures.updateIntent(id, input.chineseIntent);
  }

  @Post(':id/revisions')
  @UseInterceptors(new ResponseSchemaInterceptor(RevisionResponseSchema))
  appendRevision(
    @Param('id') id: string,
    @Body(new SchemaPipe(AppendRevisionSchema)) input: AppendRevisionInput,
    @Headers('idempotency-key') key: string | undefined,
  ) { return key === undefined ? this.captures.appendRevision(id, input) : this.commands.appendRevision(id, key, input); }

  @Get(':id/revisions')
  @UseInterceptors(new ResponseSchemaInterceptor(RevisionPageSchema))
  revisions(
    @Param('id') id: string,
    @Query(new SchemaPipe(RevisionQuerySchema)) query: z.infer<typeof RevisionQuerySchema>,
  ) {
    return this.captures.revisions(id,
      query.before === undefined ? undefined : Number(query.before),
      query.limit === undefined ? 20 : Number(query.limit));
  }

  @Get(':id')
  @UseInterceptors(new ResponseSchemaInterceptor(CaptureResponseSchema))
  detail(@Param('id') id: string) {
    return this.captures.find(id);
  }
}
