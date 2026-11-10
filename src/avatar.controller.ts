import { Controller, Post, Query, Req, Res } from '@nestjs/common';
import { finished } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { renderAvatar } from './avatar-image.js';
import { withAvatarUpload } from './avatar-upload.js';
import { ApplicationState } from './application-state.js';
import { EmptyObjectSchema } from './candidate-contract.js';
import { parseInput } from './input-validation.js';

async function sendPreview(response: Response, result: Buffer): Promise<void> {
  if (response.destroyed) return;
  const timer = setTimeout(() => response.destroy(), 3_000);
  try {
    response.status(200).type('image/webp').set('Content-Length', String(result.length)).end(result);
    await finished(response, { cleanup: true });
  } finally {
    clearTimeout(timer);
  }
}

@Controller('profile/avatar')
export class AvatarController {
  constructor(private readonly state: ApplicationState) {}

  @Post('preview')
  async preview(@Req() request: Request, @Res() response: Response, @Query() query: unknown): Promise<void> {
    const drain = new AbortController();
    const unsubscribe = this.state.onDrain(() => drain.abort());
    if (this.state.draining) drain.abort();
    try {
      parseInput(EmptyObjectSchema, query);
      await this.state.track(() => withAvatarUpload(
        request, renderAvatar, result => sendPreview(response, result), drain.signal,
      ));
    } catch (error) {
      if (!response.destroyed && !response.headersSent) response.setHeader('Connection', 'close');
      throw error;
    } finally {
      unsubscribe();
    }
  }
}
