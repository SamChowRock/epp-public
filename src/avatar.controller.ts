import { requireSession, type AuthenticatedRequest } from './auth-context.js';
import { UserIdSchema } from './auth-contract.js';
import { AvatarLink, AvatarVisibility, PublishedAvatar } from './avatar-contract.js';
import { AvatarPublication } from './avatar-publication.js';
import { SchemaPipe } from './schema.pipe.js';
import { ResponseSchemaInterceptor } from './response-schema.interceptor.js';
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res, UseInterceptors } from '@nestjs/common';
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

@Controller()
export class AvatarController {
  constructor(private readonly state: ApplicationState, private readonly avatars: AvatarPublication) {}

  @Post('profile/avatar/preview')
  async preview(@Req() request: Request, @Res() response: Response, @Query() query: unknown) {
    return this.upload(request, response, query, async receiveFile => {
      await sendPreview(response, await receiveFile(renderAvatar));
    });
  }

  @Post('profile/avatar')
  @HttpCode(200)
  @UseInterceptors(new ResponseSchemaInterceptor(PublishedAvatar))
  async publish(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response,
    @Query() query: unknown) {
    const identity = requireSession(request);
    return this.upload(request, response, query, async receiveFile => {
      const id = await this.avatars.reserve(identity);
      const bytes = await receiveFile(renderAvatar);
      return this.avatars.publish(identity, id, bytes);
    });
  }

  private async upload<T>(request: Request, response: Response, query: unknown,
    work: Parameters<typeof withAvatarUpload<T>>[1]) {
    const drain = new AbortController();
    const unsubscribe = this.state.onDrain(() => drain.abort());
    if (this.state.draining) drain.abort();
    try {
      parseInput(EmptyObjectSchema, query);
      return await this.state.track(() => withAvatarUpload(request, work, drain.signal));
    } catch (error) {
      if (!response.destroyed && !response.headersSent) response.setHeader('Connection', 'close');
      throw error;
    } finally {
      unsubscribe();
    }
  }

  @Get('profile/avatar')
  @UseInterceptors(new ResponseSchemaInterceptor(AvatarLink))
  own(@Req() request: AuthenticatedRequest, @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.state.track(() => this.avatars.read(requireSession(request)));
  }

  @Get('profiles/:userId/avatar')
  @UseInterceptors(new ResponseSchemaInterceptor(AvatarLink))
  published(@Req() request: AuthenticatedRequest, @Param('userId', new SchemaPipe(UserIdSchema)) userId: string,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.state.track(() => this.avatars.read(requireSession(request), userId));
  }

  @Get('profile/avatar/visibility')
  @UseInterceptors(new ResponseSchemaInterceptor(AvatarVisibility))
  getVisibility(@Req() request: AuthenticatedRequest, @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.state.track(() => this.avatars.getVisibility(requireSession(request)));
  }

  @Patch('profile/avatar/visibility')
  @UseInterceptors(new ResponseSchemaInterceptor(AvatarVisibility))
  visibility(@Req() request: AuthenticatedRequest, @Body(new SchemaPipe(AvatarVisibility)) input: { visible: boolean },
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.state.track(() => this.avatars.visibility(requireSession(request), input.visible));
  }
}
