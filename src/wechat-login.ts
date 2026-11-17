import { z } from 'zod';
import type { AppConfig } from './config.js';
import { HttpError } from './http.js';

const ReplySchema = z.object({
  errcode: z.number().int().optional(),
  openid: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
});
export interface WechatExchange { exchange(code: string): Promise<{ appId: string; openId: string }>; }
export class WechatLogin implements WechatExchange {
  private active = 0;
  constructor(private readonly config: AppConfig['wechat'], private readonly request: typeof fetch = fetch) {}
  async exchange(code: string) {
    if (!this.config) throw new HttpError(503, 'Mini program login is not configured', 'MINI_NOT_CONFIGURED');
    if (this.active >= 2) throw new HttpError(429, 'Platform login is busy', 'PLATFORM_BUSY');
    this.active++;
    const unavailable = () => new HttpError(503, 'Platform login is unavailable; obtain a fresh code', 'PLATFORM_UNAVAILABLE');
    try {
      const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
      url.search = new URLSearchParams({ appid: this.config.appId, secret: this.config.secret,
        js_code: code, grant_type: 'authorization_code' }).toString();
      const response = await this.request(url, { signal: AbortSignal.timeout(4000), redirect: 'error' });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw unavailable(); }
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 8192) { await reader.cancel(); throw unavailable(); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const reply = ReplySchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
      if (reply.errcode === 40029 || reply.errcode === 40163) {
        throw new HttpError(401, 'Platform code is invalid; obtain a fresh code', 'PLATFORM_CODE_INVALID');
      }
      if ((reply.errcode !== undefined && reply.errcode !== 0) || !reply.openid) throw unavailable();
      return { appId: this.config.appId, openId: reply.openid };
    } catch (error) {
      // Provider errors and fetch causes may contain the secret-bearing URL.
      if (error instanceof HttpError) throw error;
      throw unavailable();
    } finally { this.active--; }
  }
}
