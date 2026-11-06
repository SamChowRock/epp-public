import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req, Res, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { APP_CONFIG } from './config.js';
import type { AppConfig } from './config.js';
import { requireSession } from './auth-context.js';
import type { AuthenticatedRequest } from './auth-context.js';
import { LoginSchema, ChangePasswordSchema, SessionIdentitySchema, SessionListSchema, UserIdSchema } from './auth-contract.js';
import type { LoginInput, ChangePasswordInput } from './auth-contract.js';
import { EmptyObjectSchema } from './candidate-contract.js';
import { SchemaPipe } from './schema.pipe.js';
import { ResponseSchemaInterceptor } from './response-schema.interceptor.js';
import { SessionService } from './session.service.js';
import { setSessionCookie, clearSessionCookie } from './session-http.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly sessions: SessionService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}
  @Post('login')
  @HttpCode(200)
  @UseInterceptors(new ResponseSchemaInterceptor(SessionIdentitySchema))
  async login(@Body(new SchemaPipe(LoginSchema)) input: LoginInput,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object,
    @Res({ passthrough: true }) response: Response) {
    const result = await this.sessions.login(input);
    setSessionCookie(response, this.config, result.token);
    return result.identity;
  }
  @Get('me')
  @UseInterceptors(new ResponseSchemaInterceptor(SessionIdentitySchema))
  me(@Req() request: AuthenticatedRequest, @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return requireSession(request);
  }
  @Get('sessions')
  @UseInterceptors(new ResponseSchemaInterceptor(SessionListSchema))
  list(@Req() request: AuthenticatedRequest, @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.sessions.list(requireSession(request));
  }
  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(@Req() request: AuthenticatedRequest, @Param('id', new SchemaPipe(UserIdSchema)) id: string,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object, @Res({ passthrough: true }) response: Response) {
    const identity = requireSession(request);
    await this.sessions.revoke(identity.userId, id);
    if (id === identity.sessionId) clearSessionCookie(response, this.config);
  }
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: AuthenticatedRequest, @Body(new SchemaPipe(EmptyObjectSchema)) _input: object,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object, @Res({ passthrough: true }) response: Response) {
    if (request.auth) await this.sessions.revoke(request.auth.userId, request.auth.sessionId);
    clearSessionCookie(response, this.config);
  }
  @Post('password')
  @HttpCode(204)
  async password(@Req() request: AuthenticatedRequest, @Body(new SchemaPipe(ChangePasswordSchema)) input: ChangePasswordInput,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object, @Res({ passthrough: true }) response: Response) {
    await this.sessions.changePassword(requireSession(request), input);
    clearSessionCookie(response, this.config);
  }
}
