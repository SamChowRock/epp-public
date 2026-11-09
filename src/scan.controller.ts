import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { APP_CONFIG, type AppConfig } from './config.js';
import { requireSession, type AuthenticatedRequest } from './auth-context.js';
import { EmptyObjectSchema } from './candidate-contract.js';
import { SceneInput, type SceneBody } from './scan-contract.js';
import { SchemaPipe } from './schema.pipe.js';
import { readCookie, setSessionCookie } from './session-http.js';
import { tokenDigest } from './token.js';
import { ScanService } from './scan.service.js';
import { HttpError } from './http.js';
import { scanPage } from './scan-page.js';

@Controller('auth/scan')
export class ScanController {
  constructor(private readonly scan: ScanService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}
  private get secure() { return this.config.appOrigin.startsWith('https:'); }
  private get cookieName() { return this.secure ? '__Host-epp_scan' : 'epp_scan'; }
  private digest(req: Request) {
    const value = readCookie(req.headers.cookie, this.cookieName);
    try { return tokenDigest(value); }
    catch { throw new HttpError(404, 'Ticket unavailable; start again', 'SCAN_UNAVAILABLE'); }
  }

  @Get()
  page(@Res() res: Response) {
    const nonce = randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', `default-src 'none'; connect-src 'self'; img-src data:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`);
    res.type('html').send(scanPage(nonce));
  }

  @Post('start') @HttpCode(201)
  async start(@Body(new SchemaPipe(EmptyObjectSchema)) _body: object, @Res({passthrough:true}) res: Response) {
    const { scene, browser } = await this.scan.start();
    const image = await QRCode.toDataURL('epp:login:v1:' + scene, { width: 240, margin: 4 });
    res.cookie(this.cookieName, browser, { secure:this.secure, path:'/', sameSite:'strict', httpOnly:true, maxAge:120000 });
    return { scene, image };
  }

  @Post('status') @HttpCode(200)
  status(@Body(new SchemaPipe(SceneInput)) body: SceneBody, @Req() req: Request) {
    return this.scan.observe(body.scene, this.digest(req));
  }

  @Post('cancel') @HttpCode(200)
  cancel(@Body(new SchemaPipe(SceneInput)) body: SceneBody, @Req() req: Request) {
    return this.scan.cancel(body.scene, this.digest(req));
  }

  @Post('inspect') @HttpCode(200)
  async inspect(@Body(new SchemaPipe(SceneInput)) body: SceneBody) {
    const result = await this.scan.observe(body.scene);
    return { ...result, origin:this.config.appOrigin, displayCode:body.scene.slice(-6) };
  }

  @Post('confirm') @HttpCode(200)
  confirm(@Body(new SchemaPipe(SceneInput)) body: SceneBody, @Req() req: AuthenticatedRequest) {
    return this.scan.confirm(body.scene, requireSession(req));
  }

  @Post('consume') @HttpCode(200)
  async consume(@Body(new SchemaPipe(SceneInput)) body: SceneBody, @Req() req: Request,
    @Res({passthrough:true}) res: Response) {
    const result = await this.scan.consume(body.scene, this.digest(req));
    setSessionCookie(res, this.config, result.token);
    return { userId: result.userId };
  }
}
