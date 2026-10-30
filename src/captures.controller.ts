import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CapturesService } from './captures.service.js';
import { parseListQuery } from './capture-query.js';
import { httpResult } from './http.js';
import { CreateCaptureSchema, toCaptureResponse } from './capture-contract.js';
import { parseInput } from './input-validation.js';

@Controller('captures')
export class CapturesController {
  constructor(private readonly captures: CapturesService) {}

  @Get()
  list(
    @Query('q') q: unknown,
    @Query('limit') limit: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return httpResult(async () => ({
      items: (await this.captures.list(parseListQuery(q, limit))).map(toCaptureResponse),
    }), response);
  }

  @Post()
  create(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return httpResult(async () => {
      const input = parseInput(CreateCaptureSchema, body);
      const capture = await this.captures.create(input.originalText);
      const result = toCaptureResponse(capture);
      response.setHeader('Location', `/captures/${capture.id}`);
      return result;
    }, response);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    return httpResult(async () => toCaptureResponse(await this.captures.find(id)), response);
  }
}
