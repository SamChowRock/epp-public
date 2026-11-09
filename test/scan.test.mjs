import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/src/app.js';
import { parseConfig } from '../dist/src/config.js';
import { DatabaseService } from '../dist/src/database.service.js';
import { issueToken, tokenDigest } from '../dist/src/token.js';

test('phone consent, browser possession, revocation, timeout and concurrent delivery', async () => {
  const app = await createApp(parseConfig({port:3000},{NODE_ENV:'test',LOG_LEVEL:'error'}));
  const database = app.get(DatabaseService), db = database.client;
  const users = [], scenes = [];
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    async function mobile() {
      const id = randomUUID(), sessionId = randomUUID(), token = issueToken();
      await db.user.create({data:{id,webEnabled:true,miniEnabled:true,sessions:{create:{
        id:sessionId,label:'Phone fixture',channel:'mini',tokenDigest:tokenDigest(token),expiresAt:new Date(Date.now()+600000)
      }}}});
      users.push(id);
      return {id,sessionId,headers:{Authorization:'Bearer '+token}};
    }
    const a = await mobile(), b = await mobile();
    const post = (path, body, headers={}) => fetch(base+'/auth/scan/'+path,{method:'POST',
      headers:{'Content-Type':'application/json','X-EPP-Request':'1',...headers},body:JSON.stringify(body)});
    async function start() {
      const r = await post('start',{}); assert.equal(r.status,201);
      const {scene,image} = await r.json(); scenes.push(scene);
      assert.match(image,/^data:image\/png;base64,/);
      return {body:{scene},web:{Cookie:r.headers.getSetCookie()[0].split(';')[0]}};
    }
    const t = await start();
    assert.equal((await post('inspect',t.body,t.web)).status,401);
    assert.equal((await post('status',t.body)).status,404);
    assert.equal((await post('confirm',{...t.body,userId:b.id},a.headers)).status,400);
    assert.equal((await (await post('inspect',t.body,a.headers)).json()).status,'pending');
    assert.equal((await post('consume',t.body,t.web)).status,409);
    const race = await Promise.all([a,b].map(u=>post('confirm',t.body,u.headers)));
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
    const winner = race[0].ok ? a : b;
    assert.equal((await post('confirm',t.body,winner.headers)).status,200);
    assert.equal((await post('consume',t.body)).status,404);
    const issued = await Promise.all([1,2].map(()=>post('consume',t.body,t.web)));
    assert.deepEqual(issued.map(r=>r.status).sort(),[200,409]);
    const cookie = issued.find(r=>r.ok).headers.getSetCookie()[0].split(';')[0];
    const me = await fetch(base+'/auth/me',{headers:{Cookie:cookie}});
    assert.equal((await me.json()).userId,winner.id);
    assert.equal((await post('start',{},{Cookie:cookie})).status,409);
    assert.equal(await db.session.count({where:{userId:winner.id,channel:'web'}}),1);

    const cancelled = await start();
    assert.equal((await post('confirm',cancelled.body,a.headers)).status,200);
    assert.equal((await post('cancel',cancelled.body,cancelled.web)).status,200);
    assert.equal((await post('consume',cancelled.body,cancelled.web)).status,409);

    const changed = await start();
    assert.equal((await post('confirm',changed.body,a.headers)).status,200);
    await db.user.update({where:{id:a.id},data:{webEnabled:false}});
    assert.equal((await post('consume',changed.body,changed.web)).status,403);
    await db.user.update({where:{id:a.id},data:{webEnabled:true}});
    await db.session.delete({where:{id:a.sessionId}});
    assert.equal((await post('consume',changed.body,changed.web)).status,403);

    const expired = await start();
    await db.browserLoginTicket.update({where:expired.body,data:{expiresAt:new Date(0)}});
    assert.equal((await post('confirm',expired.body,b.headers)).status,404);
    assert.equal((await post('status',expired.body,expired.web)).status,404);
  } finally {
    await db.browserLoginTicket.deleteMany({where:{scene:{in:scenes}}});
    await db.session.deleteMany({where:{userId:{in:users}}});
    await db.user.deleteMany({where:{id:{in:users}}});
    await app.close();
  }
});
