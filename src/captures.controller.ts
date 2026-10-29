import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CapturesService } from './captures.service.js';
import { HttpError, readJson, respond, sendJson } from './http.js';

@Controller('captures')
export class CapturesController {
  constructor(private readonly captures: CapturesService) {}

  @Get()
  list(@Res() response: Response): Promise<void> {
    return respond(response, () => {
      sendJson(response, 200, { items: this.captures.list() });
    });
  }

  @Post()
  create(@Req() request: Request, @Res() response: Response): Promise<void> {
    return respond(response, async () => {
      const mediaType = request.headers['content-type']
        ?.split(';')[0]?.trim().toLowerCase();
      if (mediaType !== 'application/json') {
        throw new HttpError(415, 'Content-Type must be application/json');
      }
      const body = await readJson(request);
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'Request body must be a JSON object');
      }
      const capture = this.captures.create(
        'originalText' in body ? body.originalText : undefined,
      );
      sendJson(response, 201, capture, {
        Location: `/captures/${capture.id}`,
      });
    });
  }

  @Get(':id')
  detail(@Req() request: Request, @Res() response: Response): Promise<void> {
    return respond(response, () => {
      const { pathname } = new URL(request.url, 'http://127.0.0.1');
      const id = pathname.slice('/captures/'.length);
      sendJson(response, 200, this.captures.find(id));
    });
  }
}
