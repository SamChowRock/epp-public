import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from './config.js';
import { DatabaseService } from './database.service.js';
import { SessionService } from './session.service.js';
import { ApplicationState } from './application-state.js';
import { ExternalStart } from './external-start.js';
import { EmptyObjectSchema } from './candidate-contract.js';
import { SchemaPipe } from './schema.pipe.js';
import { readCookie, setSessionCookie } from './session-http.js';
import { OidcFlow } from './oidc-flow.js';
import { resolveOidcAccount } from './oidc-accounts.js';
import { oidcPage } from './oidc-page.js';

@Controller('auth/oidc')
export class OidcController {
  private readonly flow: OidcFlow;
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig, private readonly db: DatabaseService,
    private readonly sessions: SessionService, private readonly state: ApplicationState) { this.flow = new OidcFlow(config); }
  private get secure() { return this.config.appOrigin.startsWith('https:'); }
  private get cookie() { return this.secure ? '__Host-epp_oidc' : 'epp_oidc'; }
  private get options() { return { secure: this.secure, path: '/', httpOnly: true, sameSite: 'lax' as const }; }
  @Get()
  page(@Res() res: Response) {
    const nonce = randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; style-src 'nonce-${nonce}'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`);
    res.type('html').send(oidcPage(nonce));
  }
  @Post('start') @HttpCode(200)
  start(@Body(new SchemaPipe(ExternalStart)) input: z.infer<typeof ExternalStart>, @Query(new SchemaPipe(EmptyObjectSchema)) _query: object,
    @Res({ passthrough: true }) res: Response) {
    return this.state.track(async () => {
      const proof = input.mode === 'link' ? { userId: input.userId, passwordHash: await this.sessions.passwordWork(() =>
        this.sessions.provePassword(input.userId, input.password)) } : undefined;
      const start = await this.flow.start(proof);
      res.cookie(this.cookie, start.browser, { ...this.options, maxAge: 300_000 });
      return { authorizationUrl: start.url };
    });
  }
  @Get('callback')
  callback(@Req() req: Request, @Res() res: Response) {
    return this.state.track(async () => {
      const query = new URL(req.url, this.config.appOrigin).search;
      const { issuer, subject, proof } = await this.flow.finish(query, readCookie(req.headers.cookie, this.cookie));
      res.clearCookie(this.cookie, this.options);
      const result = await resolveOidcAccount(this.db, issuer, subject, proof);
      if (result.token) setSessionCookie(res, this.config, result.token);
      res.redirect(303, result.token ? '/auth/oidc#signed-in' : '/auth/oidc#pending=' + result.userId);
    });
  }
}
