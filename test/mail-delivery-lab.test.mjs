import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// A changed official endpoint must fail before making any local HTTP call.
test('local injection rejects a nonofficial URL before contacting its peer', async () => {
  const mod = await import('../examples/mail-delivery/boundaries.mjs').catch(() => ({}));
  assert.equal(typeof mod.localRequest, 'function');
  const request = mod.localRequest(3454, 'accepted');
  await assert.rejects(request('https://attacker.test/emails', {}), /OFFICIAL_ENDPOINT_REQUIRED/);
  await assert.rejects(request('https://api.resend.com/emails?other=1', {}), /OFFICIAL_ENDPOINT_REQUIRED/);
});
test('private input refuses readable files and symbolic links', async () => {
  const mod = await import('../examples/mail-delivery/boundaries.mjs').catch(() => ({}));
  assert.equal(typeof mod.readPrivate, 'function');
  const dir = await mkdtemp(join(tmpdir(), 'ch54-private-'));
  try {
    const file = join(dir, 'config.json');
    await writeFile(file, '{}', { mode: 0o644 });
    await assert.rejects(mod.readPrivate(file), /PRIVATE_FILE_REQUIRED/);
    await chmod(file, 0o600);
    assert.deepEqual(await mod.readPrivate(file), {});
    const { symlink } = await import('node:fs/promises');
    await symlink(file, join(dir, 'link'));
    await assert.rejects(mod.readPrivate(join(dir, 'link')));
  } finally { await rm(dir, {recursive:true,force:true}); }
});
test('local injection forwards exact adapter bytes only to its loopback peer', async () => {
  const { localRequest } = await import('../examples/mail-delivery/boundaries.mjs');
  const { createServer } = await import('node:http');
  let seen;
  const server=createServer(async(req,res)=>{
    let body='';for await(const b of req) body+=b;
    seen={url:req.url,body,authorization:req.headers.authorization,mode:req.headers['x-epp-local-mode']};
    res.writeHead(200,{'content-type':'application/json'}).end('{"id":"10000000-0000-4000-8000-000000000001"}');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const response=await localRequest(server.address().port,'lost')('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:'Bearer synthetic-only'},body:'{"to":["a54@example.test"]}'});
    assert.equal(response.status,200);await response.arrayBuffer();
    assert.deepEqual(seen,{url:'/emails',body:'{"to":["a54@example.test"]}',authorization:'Bearer synthetic-only',mode:'lost'});
  } finally {await new Promise(r=>server.close(r));}
});
test('a later early-event 204 replaces an earlier replay 400 in the shared response record', async () => {
  const mod=await import('../examples/mail-delivery/boundaries.mjs');
  assert.equal(typeof mod.saveResponse,'function');
  const dir=await mkdtemp(join(tmpdir(),'ch54-response-'));
  try{
    const file=join(dir,'last-response.json');
    await mod.saveResponse(file,'wrong-signature',400);
    await mod.saveResponse(file,'early-event',204);
    assert.deepEqual(await mod.readPrivate(file),{eventId:'early-event',status:204});
  }finally{await rm(dir,{recursive:true,force:true});}
});
