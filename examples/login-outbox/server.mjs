import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const path = process.argv[2];
if (!path || process.argv.length !== 3) throw Error('Usage: node server.mjs /absolute/private/config.json');
if (!path.startsWith('/') || ((await stat(path)).mode & 0o777) !== 0o600) throw Error('Absolute config path with mode 0600 required');
const config = JSON.parse(await readFile(path, 'utf8'));
const base = new URL(config.apiBase);
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port || base.username || base.password || base.search || base.hash || base.pathname !== '/' || config.apiBase !== base.origin) throw Error('apiBase must be an explicit 127.0.0.1 HTTP origin');
if (!/^[0-9a-f-]{36}$/.test(config.captureId)) throw Error('Fixed captureId required');
for (const key of ['miniAToken', 'miniBToken']) if (config[key] !== undefined && !/^[A-Za-z0-9_-]{43}$/.test(config[key])) throw Error('Missing mini credential');
if (!/^(?:__Host-)?epp_session=[A-Za-z0-9_-]{43}$/.test(config.webCookie)) throw Error('Cookie name=value required');
const channels = { web: { Cookie: config.webCookie }, 'mini-a': config.miniAToken ? { Authorization: `Bearer ${config.miniAToken}` } : undefined, 'mini-b': config.miniBToken ? { Authorization: `Bearer ${config.miniBToken}` } : undefined };
async function api(path, headers, options = {}) {
  const response = await fetch(config.apiBase + path, { ...options, headers, redirect: 'error', signal: AbortSignal.timeout(5000) });
  const body = await response.json(); return { status: response.status, body };
}
const html = `<!doctype html><meta charset="utf-8"><title>第50章身份观察</title><style>body{font:18px system-ui;max-width:960px;margin:40px auto;background:#f4f7fb;color:#18253b}button{font:inherit;margin:6px;padding:12px}pre{white-space:pre-wrap;background:white;padding:24px;border-radius:12px}</style><h1>第50章：同一份素材的身份边界</h1><p>本地身份集成观察；平台交换使用独立替身，未连接微信。</p><p>每次点击读取真实API；凭据由本地服务端持有。状态随资格、撤销和进程变化。</p><button data-channel="web">Web读取</button><button data-channel="mini-a">甲mini读取</button><button data-channel="mini-b">乙mini读取</button><button data-channel="unconfigured-login">未配置登录（实际POST）</button><pre id="result">等待手动读取</pre><script>document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await fetch('/observe/'+b.dataset.channel);document.querySelector('#result').textContent=JSON.stringify(await r.json(),null,2)}catch{document.querySelector('#result').textContent='观察服务连接失败'}finally{b.disabled=false}})</script>`;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");
  if (req.headers.host !== '127.0.0.1:8350' || (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:8350') || (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) { res.writeHead(403); res.end(); return; }
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  if (req.url === '/') { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html); return; }
  const channel = req.url?.startsWith('/observe/') ? req.url.slice(9) : '';
  if (!Object.hasOwn(channels, channel) && channel !== 'unconfigured-login') { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type','application/json; charset=utf-8');
  try {
    if (channel === 'unconfigured-login') {
      const reply = await api('/auth/mini/login', {'Content-Type':'application/json','X-EPP-Request':'1'}, {method:'POST',body:JSON.stringify({code:'local-observation-once',label:'Unconfigured observation'})});
      res.end(JSON.stringify({channel,status:reply.status,code:reply.body.code ?? null})); return;
    }
    const headers = channels[channel];
    if (!headers) { res.end(JSON.stringify({channel,status:null,code:'OBSERVATION_CREDENTIAL_NOT_CONFIGURED'})); return; }
    const identity = await api('/auth/me', headers);
    const capture = await api('/captures/'+config.captureId, headers);
    let revision = null;
    if (capture.status === 200) {
      const revisions = await api('/captures/'+config.captureId+'/revisions?limit=1', headers);
      if (revisions.status === 200) revision = revisions.body.items?.[0]?.revisionNo ?? null;
    }
    res.end(JSON.stringify({channel,identityStatus:identity.status,userId:identity.status === 200 ? identity.body.userId : null,
      status:capture.status,code:capture.body.code ?? null,captureId:config.captureId,revision,
      summary:capture.status === 200 ? createHash('sha256').update(JSON.stringify(capture.body)).digest('hex') : null}));
  } catch { res.writeHead(502); res.end(JSON.stringify({channel,status:502,code:'OBSERVATION_UNAVAILABLE'})); }
});
server.listen(8350,'127.0.0.1',()=>console.log('Observation: http://127.0.0.1:8350'));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close());
