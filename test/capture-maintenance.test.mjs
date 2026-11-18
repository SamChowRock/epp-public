import './database-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {startCaptureScan,scanCaptureBatch,quarantineCapture,exportCaptureEvidence,repairCapture,evidenceDigest,withMaintenanceDatabase} from '../dist/src/capture-integrity-maintenance.js';

test('bounded scan resumes; repair preserves evidence, rolls back on failure, and replays safely',async t=>{
 const c=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await c.connect();
 const user=randomUUID(),bad=randomUUID(),scan=randomUUID(),scan2=randomUUID(),scan3=randomUUID();
 await c.query('INSERT INTO public.users(id) VALUES($1)',[user]);
 await c.query('INSERT INTO public.captures(id,user_id,original_text,chinese_intent) VALUES($1,$2,$3,$4)',[bad,user,'first snapshot','initial']);
 const revisionIds=[randomUUID(),randomUUID()];
 for(let i=0;i<2;i++)await c.query('INSERT INTO public.capture_revisions(id,capture_id,revision_no,original_text,input_source) VALUES($1,$2,$3,$4,$5)',[revisionIds[i],bad,i+1,'version '+(i+1),'manual']);
 t.after(async()=>{await c.query('ALTER TABLE public.capture_revisions DROP CONSTRAINT IF EXISTS ch66_repair_fault');await c.query('DELETE FROM public.capture_integrity_repairs WHERE case_id IN(SELECT id FROM public.capture_integrity_cases WHERE capture_id=$1)',[bad]);await c.query('DELETE FROM public.capture_integrity_cases WHERE capture_id=$1',[bad]);await c.query('DELETE FROM public.capture_integrity_scans WHERE id=ANY($1::uuid[])',[[scan,scan2,scan3]]);await c.query('DELETE FROM public.capture_revisions WHERE capture_id=$1',[bad]);await c.query('DELETE FROM public.captures WHERE id=$1',[bad]);await c.query('DELETE FROM public.users WHERE id=$1',[user]);await c.end();});
 const evidence=await exportCaptureEvidence(c,bad,'trusted isolated backup 66');
 const bytes=Buffer.from(JSON.stringify(evidence));const sha=evidenceDigest(bytes);
 await c.query('DELETE FROM public.capture_revisions WHERE capture_id=$1',[bad]);
 await assert.rejects(()=>withMaintenanceDatabase('wrong_database',()=>{throw Error('must not reach');}),/differs/);
 const first=await startCaptureScan(c,scan);assert.equal((await startCaptureScan(c,scan)).started_at.getTime(),first.started_at.getTime());
 // Each call is one committed batch; the next process can use the same ID.
 let result;do{result=await scanCaptureBatch(c,scan,1);}while(!result.finished);
 const issue=(await c.query("SELECT * FROM public.capture_integrity_cases WHERE capture_id=$1 AND state='observed'",[bad])).rows[0];assert.ok(issue);
 await startCaptureScan(c,scan2);do{result=await scanCaptureBatch(c,scan2,1);}while(!result.finished);
 const again=(await c.query('SELECT * FROM public.capture_integrity_cases WHERE id=$1',[issue.id])).rows[0];assert.equal(again.first_seen_at.getTime(),issue.first_seen_at.getTime());assert.equal((await c.query('SELECT count(*)::int n FROM public.capture_integrity_cases WHERE capture_id=$1',[bad])).rows[0].n,1);
 await quarantineCapture(c,issue.id);await quarantineCapture(c,issue.id);
 await assert.rejects(()=>repairCapture(c,issue.id,bytes,'0'.repeat(64)),/digest/);
 await c.query('UPDATE public.captures SET chinese_intent=$2 WHERE id=$1',[bad,'changed after backup']);
 await assert.rejects(()=>repairCapture(c,issue.id,bytes,sha),/parent differs/);
 await c.query('UPDATE public.captures SET chinese_intent=$2 WHERE id=$1',[bad,'initial']);
 // A real SQL error on the second insert must undo the first insert and leave quarantine intact.
 await c.query(`ALTER TABLE public.capture_revisions ADD CONSTRAINT ch66_repair_fault CHECK (id <> '${revisionIds[1]}'::uuid) NOT VALID`);
 await assert.rejects(()=>repairCapture(c,issue.id,bytes,sha));
 assert.equal((await c.query('SELECT count(*)::int n FROM public.capture_revisions WHERE capture_id=$1',[bad])).rows[0].n,0);
 assert.equal((await c.query('SELECT state FROM public.capture_integrity_cases WHERE id=$1',[issue.id])).rows[0].state,'quarantined');
 await c.query('ALTER TABLE public.capture_revisions DROP CONSTRAINT ch66_repair_fault');
 // Hold the real repair transaction just before COMMIT while a second connection scans.
 const repairing=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await repairing.connect();
 const query=repairing.query.bind(repairing);let releaseCommit,atCommit;
 const gate=new Promise(r=>releaseCommit=r), reached=new Promise(r=>atCommit=r);
 repairing.query=async(...args)=>{if(args[0]==='COMMIT'){atCommit();await gate;}return query(...args);};
 await startCaptureScan(c,scan3);
 const repair=repairCapture(repairing,issue.id,bytes,sha);await reached;
 const scanning=scanCaptureBatch(c,scan3,1000);
 // The scan must encounter the row while repair is still uncommitted.
 const observer=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await observer.connect();
 let blocked=false;
 for(let i=0;i<100;i++){const row=(await observer.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[c.processID])).rows[0];if(row?.wait_event_type==='Lock'){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}
 releaseCommit();await repair;await scanning;await repairing.end();await observer.end();
 assert.equal(blocked,true);
 assert.equal((await c.query("SELECT count(*)::int n FROM public.capture_integrity_cases WHERE capture_id=$1 AND state<>'repaired'",[bad])).rows[0].n,0,'scan must recheck after concurrent repair');
 assert.equal((await repairCapture(c,issue.id,bytes,sha)).replay,true);
 const changed=Buffer.from(JSON.stringify({...evidence,sourceRef:'another source'}));await assert.rejects(()=>repairCapture(c,issue.id,changed,evidenceDigest(changed)),/replay conflicts/);
 const restored=await exportCaptureEvidence(c,bad,'check');assert.deepEqual(restored.revisions,evidence.revisions);
 await c.query('INSERT INTO public.capture_revisions(id,capture_id,revision_no,original_text,input_source) VALUES($1,$2,3,$3,$4)',[randomUUID(),bad,'normal later append','manual']);
 assert.equal((await repairCapture(c,issue.id,bytes,sha)).replay,true);
 await assert.rejects(()=>quarantineCapture(c,issue.id),/repaired/);
});
