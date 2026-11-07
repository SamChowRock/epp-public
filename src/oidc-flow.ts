import * as oidc from 'openid-client';
import type { AppConfig } from './config.js';
import { HttpError } from './http.js';
import { issueToken } from './token.js';

export type LinkProof = { userId: string; passwordHash: string };
type Attempt = { state: string; browser: string; verifier: string; nonce: string; until: number; proof?: LinkProof };
const invalidFlow = () => new HttpError(400, 'Start a new external login', 'OIDC_FLOW_INVALID');

const invalidIdentity = () => new HttpError(401, 'External login could not be verified; start again', 'OIDC_EXCHANGE_FAILED');

export class OidcFlow {
  // shortcut: one process for start and callback; use a shared, expiring atomic store before scaling out.
  private readonly attempts = new Map<string, Attempt>();
  private configuration?: Promise<oidc.Configuration>;
  private exchanging = 0;
  constructor(private readonly config: AppConfig) {}
  get callback() { return this.config.appOrigin + '/auth/oidc/callback'; }
  private client() {
    const p = this.config.oidc;
    if (!p) throw new HttpError(503, 'External login is not configured', 'OIDC_NOT_CONFIGURED');
    const issuer = new URL(p.issuer);
    const lab = this.config.mode === 'test' && issuer.protocol === 'http:' && ['127.0.0.1','localhost'].includes(issuer.hostname);
    return this.configuration ??= oidc.discovery(issuer, p.clientId,
      { id_token_signed_response_alg: 'RS256' }, oidc.ClientSecretBasic(p.secret), {
        timeout: 5, execute: [oidc.enableNonRepudiationChecks, ...(lab ? [oidc.allowInsecureRequests] : [])],
        [oidc.customFetch]: async (url, options) => {
          if (lab && new URL(url).origin !== issuer.origin) throw new Error('Unexpected lab endpoint');
          const r = await fetch(url, { ...options, redirect: 'error' });
          const reader = r.body?.getReader();
          if (!reader) return r;
          const chunks: Uint8Array[] = [];
          let bytes = 0;
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 256 * 1024) { await reader.cancel(); throw new Error('Provider response too large'); }
            chunks.push(part.value);
          }
          return new Response(Buffer.concat(chunks), { status: r.status, headers: r.headers });
        },
      }).then(c => {
        const m = c.serverMetadata();
        if (m.issuer !== p.issuer || ![m.authorization_endpoint, m.token_endpoint, m.jwks_uri].every(v => {
          if (!v) return false;
          const u = new URL(v);
          return !u.username && !u.password && !u.hash && (lab ? u.origin === issuer.origin : u.protocol === 'https:');
        })) throw new Error('Unexpected metadata');
        return c;
      }).catch(() => { delete this.configuration; throw new HttpError(503, 'Identity provider unavailable', 'OIDC_PROVIDER_UNAVAILABLE'); });
  }
  async start(proof?: LinkProof) {
    const client = await this.client();
    const verifier = oidc.randomPKCECodeVerifier();
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);
    const now = performance.now();
    for (const [key,a] of this.attempts) if (a.until <= now) this.attempts.delete(key);
    if (this.attempts.size >= 256) throw new HttpError(429, 'Too many pending logins', 'OIDC_BUSY');
    const state = oidc.randomState(), browser = issueToken(), nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(client, { redirect_uri: this.callback, response_type: 'code',
      scope: 'openid', state, nonce, code_challenge: challenge, code_challenge_method: 'S256',
      ...(proof ? { prompt: 'select_account' } : {}) });
    this.attempts.set(state, { state, browser, verifier, nonce, until: now + 300_000, ...(proof ? { proof } : {}) });
    return { browser, url: url.href };
  }
  async finish(query: string, browser?: string) {
    const url = new URL(this.callback);
    url.search = query;
    const states = url.searchParams.getAll('state');
    const a = states.length === 1 ? this.attempts.get(states[0]!) : undefined;
    if (!a || !browser || a.browser !== browser || a.until <= performance.now()) throw invalidFlow();
    this.attempts.delete(a.state); // claim synchronously, before any network operation
    if (this.exchanging >= 4) throw new HttpError(429, 'Start again later', 'OIDC_BUSY');
    this.exchanging++;
    try {
      const client = await this.client();
      const tokens = await oidc.authorizationCodeGrant(client, url, {
        expectedState: a.state, expectedNonce: a.nonce, pkceCodeVerifier: a.verifier, idTokenExpected: true });
      const c = tokens.claims();
      if (!c || c.iss !== this.config.oidc!.issuer || !/^[\x21-\x7e]{1,255}$/.test(c.sub)
        || (Array.isArray(c.aud) && c.aud.some(id => id !== this.config.oidc!.clientId))
        || (c.azp !== undefined && c.azp !== this.config.oidc!.clientId)) throw invalidIdentity();
      return { issuer: c.iss, subject: c.sub, proof: a.proof };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (e instanceof oidc.AuthorizationResponseError && e.error === 'access_denied')
        throw new HttpError(403, 'External login cancelled', 'OIDC_CANCELLED');
      if (e instanceof TypeError || (e instanceof oidc.ClientError && (e.code === 'OAUTH_TIMEOUT'
        || (e.cause instanceof Response && (e.cause.status === 429 || e.cause.status >= 500))))
        || (e instanceof oidc.ResponseBodyError && ['invalid_client','temporarily_unavailable','server_error'].includes(e.error)))
        throw new HttpError(503, 'Identity provider unavailable', 'OIDC_PROVIDER_UNAVAILABLE');
      throw invalidIdentity();
    } finally { this.exchanging--; }
  }
}
