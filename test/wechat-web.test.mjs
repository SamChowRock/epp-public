import test from 'node:test';
import assert from 'node:assert/strict';
import { startWechatLab } from '../examples/wechat-web-lab.mjs';
import { WechatWebFlow } from '../dist/src/wechat-web-flow.js';
import { WechatLogin } from '../dist/src/wechat-login.js';
import { parseConfig } from '../dist/src/config.js';

test('website registration and exchange stay separate from mini program credentials', async () => {
  const site = { WECHAT_WEB_APP_ID: 'wx' + 'a'.repeat(16), WECHAT_WEB_APP_SECRET: 'a'.repeat(32) };
  assert.throws(() => parseConfig({ port: 3000 }, site));
  const env = { ...site, APP_ORIGIN: 'https://epp.example' };
  assert.throws(() => parseConfig({ port: 3000 }, { ...env, WECHAT_APP_ID: site.WECHAT_WEB_APP_ID, WECHAT_APP_SECRET: site.WECHAT_WEB_APP_SECRET }));
  const config = parseConfig({ port: 3000 }, env);
  const url = new URL(new WechatWebFlow(config).start().url);
  assert.equal(url.origin + url.pathname, 'https://open.weixin.qq.com/connect/qrconnect');
  assert.equal(url.searchParams.get('redirect_uri'), env.APP_ORIGIN + '/auth/wechat-web/callback');
  assert.equal(url.searchParams.get('scope'), 'snsapi_login');
  assert.equal(url.searchParams.has('secret'), false);
  for (const body of [{ openid:'forged' }, { access_token:'x', scope:'wrong', openid:'id' }, { errcode:40163 }]) {
    const adapter = new WechatLogin(config.wechatWeb, async () => Response.json(body), 'web');
    await assert.rejects(adapter.exchange('code'));
  }
});

test('website callback belongs to the starting browser and verified app identity', async () => {
  const lab = await startWechatLab(3391);
  const { origin, userId, password, db } = lab;
  const start = async body => {
    const r = await fetch(origin + '/auth/wechat-web/start', { method:'POST',
      headers:{ 'Content-Type':'application/json', 'X-EPP-Request':'1' }, body:JSON.stringify(body) });
    assert.equal(r.status, 200);
    const u = new URL((await r.json()).authorizationUrl);
    u.pathname = '/allow';
    return async who => {
      u.searchParams.set('who', who);
      const allow = await fetch(u, { redirect:'manual' });
      return { url: allow.headers.get('location'), cookie: r.headers.getSetCookie()[0].split(';')[0] };
    };
  };
  const finish = (a, cookie = a.cookie) => fetch(a.url, { headers:{ cookie }, redirect:'manual' });
  try {
    const link = await (await start({ mode:'link', userId, password }))('A');
    assert.equal((await finish(link, '')).status, 400);
    const pair = await Promise.all([finish(link), finish(link)]);
    assert.deepEqual(pair.map(r => r.status).sort(), [303,400]);
    const session = pair.find(r=>r.status===303).headers.getSetCookie().find(c=>c.startsWith('epp_session=')).split(';')[0];
    const me = await fetch(origin + '/auth/me', { headers:{ cookie:session } });
    assert.equal((await me.json()).userId, userId);
    const record = await fetch(origin + '/captures/' + lab.capture.id, { headers:{ cookie:session } });
    assert.deepEqual(await record.json(), lab.capture);
    assert.equal(await db.session.count({ where:{ userId, channel:'web' } }), 1);
    assert.equal((await finish(await (await start({ mode:'link', userId, password }))('B'))).status, 409);
    const pending = await finish(await (await start({ mode:'login' }))('B'));
    assert.equal(pending.status, 303);
    assert.match(pending.headers.get('location'), /#pending=/);
    assert.ok(!pending.headers.getSetCookie().some(c=>c.startsWith('epp_session=')));
    const second = pending.headers.get('location').split('=')[1];
    assert.notEqual(second,userId);
    assert.equal(await db.session.count({where:{userId:second}}),0);

    // B's browser receives A's unused authorization code; only the code is replaced.
    const fromB = await (await start({ mode:'login' }))('B');
    const fromA = await (await start({ mode:'login' }))('A');
    assert.equal((await finish(fromA, fromB.cookie)).status,400);
    const mixed = new URL(fromB.url);
    mixed.searchParams.set('code', new URL(fromA.url).searchParams.get('code'));
    const injected = await finish({ url:mixed, cookie:fromB.cookie });
    assert.equal(injected.status,303);
    const wrongSession = injected.headers.getSetCookie().find(c=>c.startsWith('epp_session=')).split(';')[0];
    const wrongBrowser = { headers:{ cookie:wrongSession } };
    assert.equal((await (await fetch(origin + '/auth/me',wrongBrowser)).json()).userId,userId);
    const exposed = await fetch(origin + '/captures/' + lab.capture.id,wrongBrowser);
    assert.equal(exposed.status,200);
    assert.deepEqual(await exposed.json(),lab.capture);
    assert.equal((await finish(fromB)).status,400);
    assert.equal((await finish(fromA)).status,401);
  } finally { await lab.close(); }
});
