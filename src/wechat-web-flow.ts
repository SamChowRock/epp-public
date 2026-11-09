import type { AppConfig } from './config.js';
import { HttpError } from './http.js';
import type { LinkProof } from './oidc-flow.js';
import { issueToken } from './token.js';
import { WechatLogin, type WechatExchange } from './wechat-login.js';

type Attempt = { browser: string; until: number; proof?: LinkProof };
const invalid = () => new HttpError(400, 'Start a new website login', 'WECHAT_WEB_FLOW_INVALID');

export class WechatWebFlow {
  private readonly attempts = new Map<string, Attempt>();

  constructor(private readonly config: AppConfig,
    private readonly platform: WechatExchange = new WechatLogin(config.wechatWeb, fetch, 'web')) {}

  start(proof?: LinkProof) {
    const app = this.config.wechatWeb;
    if (!app) throw new HttpError(503, 'Website login is not configured', 'WECHAT_WEB_NOT_CONFIGURED');
    const now = performance.now();
    for (const [key, attempt] of this.attempts) {
      if (attempt.until <= now) this.attempts.delete(key);
    }
    if (this.attempts.size >= 256) throw new HttpError(429, 'Too many pending logins', 'WECHAT_WEB_BUSY');
    const state = issueToken(), browser = issueToken();
    const url = new URL('https://open.weixin.qq.com/connect/qrconnect');
    url.search = new URLSearchParams({ appid: app.appId, redirect_uri: this.config.appOrigin + '/auth/wechat-web/callback',
      response_type: 'code', scope: 'snsapi_login', state }).toString();
    url.hash = 'wechat_redirect';
    this.attempts.set(state, { browser, until: now + 300_000, ...(proof ? { proof } : {}) });
    return { browser, url: url.href };
  }

  async finish(query: string, browser?: string) {
    const params = new URLSearchParams(query);
    const states = params.getAll('state'), codes = params.getAll('code');
    if (states.length !== 1 || codes.length !== 1 || !/^[A-Za-z0-9_-]{1,256}$/.test(codes[0]!)
      || [...params.keys()].some(key => key !== 'code' && key !== 'state')) throw invalid();
    const attempt = this.attempts.get(states[0]!);
    if (!attempt || attempt.until <= performance.now() || attempt.browser !== browser) throw invalid();
    this.attempts.delete(states[0]!);
    const identity = await this.platform.exchange(codes[0]!);
    return { ...identity, proof: attempt.proof };
  }
}
