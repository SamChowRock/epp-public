import { resolveWechatAccount } from './wechat-account.js';
import { DatabaseService } from './database.service.js';
import { ApplicationState } from './application-state.js';
import { SessionService } from './session.service.js';
import type { MiniLogin, MiniLink } from './mini-contract.js';
import type { WechatExchange } from './wechat-login.js';

export class MiniService {
  constructor(private readonly database: DatabaseService, private readonly sessions: SessionService,
    private readonly state: ApplicationState, private readonly platform: WechatExchange) {}
  login(input: MiniLogin) { return this.state.track(() => this.create(input)); }
  link(input: MiniLink) {
    return this.sessions.passwordWork(async () => {
      const passwordHash = await this.sessions.provePassword(input.userId, input.password);
      return this.create(input, { userId: input.userId, passwordHash });
    });
  }
  private async create(input: MiniLogin, proof?: { userId: string; passwordHash: string }) {
    const { appId, openId } = await this.platform.exchange(input.code);
    const result = await resolveWechatAccount(this.database, appId, openId, 'mini', input.label, proof);
    return result.pending ? { userId: result.userId, miniEnabled: false as const } : result;
  }
}
