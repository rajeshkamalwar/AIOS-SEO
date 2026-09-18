import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID,generateKeyPairSync,sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { migrate } from '../packages/persistence/migrate.js';
import { Ledger,type Principal } from '../packages/persistence/index.js';
import { LocalBlobs } from '../packages/evidence/index.js';
import { Registry } from '../packages/skills/index.js';
import { Jobs,type Lease } from '../packages/jobs/index.js';
import { HttpLane } from '../packages/jobs/http-lane.js';
import { DeletionLedger } from '../packages/policy/deletion.js';
import { canonical,manifestHash } from '../packages/contracts/index.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_http_lane_test'};
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool;
let ledger:Ledger,commands:Jobs,worker:Jobs,registry:Registry,deletions:DeletionLedger,lane:HttpLane,digest:string;
async function fixture(type:string,changes:Record<string,unknown>){
 const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes};
 const table=({Tenant:'tenant',User:'app_user',Membership:'membership'} as Record<string,string>)[type];
 const entries=Object.entries(row).filter(([k])=>!['provenance_ids','site_scope_ids'].includes(k));
 await admin.query(`INSERT INTO aios.${table} (${entries.map(([k])=>k).join(',')}) VALUES(${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));
}
async function run(origin:string,requests=750){
 const p:Principal={tenantId:randomUUID(),userId:randomUUID()};
 await fixture('Tenant',{id:p.tenantId});await fixture('User',{id:p.userId,subject:p.userId});await fixture('Membership',{id:randomUUID(),tenant_id:p.tenantId,user_id:p.userId});
 for(const kind of ['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'])await admin.query('INSERT INTO control.tenant_cap VALUES($1,$2,10000)',[p.tenantId,kind]);
 const fixtureOrigin='https://'+new URL(origin).hostname.replace(/\.$/,'');
 const site=await ledger.registerSite(p,fixtureOrigin+'/');
 const evidence=await ledger.accept(p,site,{attemptId:randomUUID(),sourceUri:fixtureOrigin+'/',capturedAt:new Date(Date.now()-1000).toISOString(),mimeType:'text/html',contextHash:manifestHash({fixture:true})},Buffer.from('fixture'));
 const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[evidence.evidenceId],[evidence.observationId]);
 // Fixture profile admission intentionally excludes HTTP/trailing-dot spelling; seed
 // canonical url-v1 Site variants with test-owner authority to exercise accounting only.
 if(fixtureOrigin!==origin)await admin.query('UPDATE aios.site SET submitted_url=$2,normalized_origin=$3,origins=$4 WHERE id=$1',[site,origin+'/',origin,[origin]]);
 const id=await commands.submit(p,site,randomUUID(),{http_requests:requests,render_requests:0,render_pages:0,model_calls:0,tokens:0,cost_microusd:0,deadline:new Date(Date.now()+600000).toISOString()});
 const next=async()=>{await commands.enqueue(p,site,id,bundle,digest,randomUUID());const l=await worker.claim();assert.ok(l);return l;};
 return {p,site,id,next};
}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_http_lane_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator'])await admin.query(`ALTER ROLE ${role} LOGIN`);
 runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});
 ledger=new Ledger(runtime,await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'http-lane-blobs'),'local-synthetic-v1'),'local-synthetic-v1');
 deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'http-lane-deletions'));
 commands=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions);registry=new Registry(operator);lane=new HttpLane(scheduler,deletions);
 await admin.query("UPDATE control.health SET verified_until=clock_timestamp()+interval '1 hour',restore_ready=true");
 const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID();
 await admin.query('INSERT INTO control.authority_key VALUES($1,$2,true)',[reviewer,keys.publicKey.export({type:'spki',format:'pem'})]);
 const manifest=JSON.parse(await readFile('spec/examples/skill-reliability-gate.json','utf8'));
 manifest.last_verified=new Date().toISOString();manifest.freshness_deadline=new Date(Date.now()+3600000).toISOString();
 const approval={author:randomUUID(),reviewer,manifest_digest:manifestHash(manifest),evaluation_digest:manifestHash({fixture:true}),approved_at:new Date().toISOString(),scope:'local-synthetic-v1' as const,dependencies:[]};
 digest=await registry.approve(manifest,approval,sign(null,Buffer.from(canonical(approval)),keys.privateKey).toString('base64'));
});
after(async()=>{for(const pool of [runtime,scheduler,operator,admin])await pool?.end();});
const input=(origin:string,maxDecodedBytes=5242880)=>({origin,maxDecodedBytes});
async function advance(origin:string){await admin.query("UPDATE control.http_origin SET last_started_at=clock_timestamp()-interval '2 seconds' WHERE origin=$1",[origin]);}
test('HTTP lane atomic idempotency, no refund and settlement integrity',async()=>{
 const origin='https://accounting.example',r=await run(origin),l=await r.next();
 const [a,b]=await Promise.all([lane.reserve(l,input(origin)),lane.reserve(l,input(origin))]);assert.deepEqual(a,b);
 await assert.rejects(lane.reserve(l,input(origin,4)),/conflict/);
 await assert.rejects(lane.settle(l,a.reservationId,5242881),/invalid_receipt/);
 await assert.rejects(lane.settle({...l,token:randomUUID()},a.reservationId,1),/invalid_receipt/);
 await lane.settle(l,a.reservationId,1);await lane.settle(l,a.reservationId,1);
 assert.equal((await lane.reserve(l,input(origin))).state,'settled');
 await assert.rejects(lane.settle(l,a.reservationId,2),/conflict/);
 await assert.rejects(worker.settle(l,a.reservationId,0),/conflict/);
 assert.equal((await admin.query('SELECT reserved_bytes FROM aios.http_reservation WHERE reservation_id=$1',[a.reservationId])).rows[0].reserved_bytes,'5242880');
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origin])).rows[0].in_flight,0);
 await commands.cancel(r.p,r.site,r.id);
});
test('HTTP lane global origin spacing and two concurrent requests across tenants survive reconnect',async()=>{
 const origin='https://shared.example',a=await run(origin),b=await run(origin),la=await a.next(),lb=await b.next();
 const first=await lane.reserve(la,input(origin));
 await assert.rejects(lane.reserve(lb,input(origin)),/origin_limited/);
 await advance(origin);const second=await lane.reserve(lb,input(origin));
 const third=await a.next();await advance(origin);
 const reopened=new HttpLane(scheduler,deletions);
 await assert.rejects(reopened.reserve(third,input(origin)),/origin_limited/);
 await commands.cancel(a.p,a.site,a.id);
 await assert.rejects(reopened.reserve(third,input(origin)),/run_fenced/);
 await reopened.settle(la,first.reservationId,0);await reopened.settle(lb,second.reservationId,0);
 assert.equal((await admin.query('SELECT count(*) FROM aios.http_reservation WHERE tenant_id=$1',[a.p.tenantId])).rows[0].count,'1');
 await commands.cancel(b.p,b.site,b.id);
});
test('HTTP lane rejects forged scope, expired lease, unhealthy policy, revoked membership and deletion',async()=>{
 const origin='https://fences.example',r=await run(origin),l=await r.next();
 await assert.rejects(lane.reserve(l,input('https://elsewhere.example')),/scope_denied/);
 await assert.rejects(lane.reserve({...l,siteId:randomUUID()},input(origin)),/run_fenced/);
 await assert.rejects(lane.reserve({...l,attemptId:randomUUID()},input(origin)),/lease_lost/);
 await assert.rejects(lane.reserve(l,input(origin,5242881)),/invalid_input/);
 await admin.query('UPDATE control.health SET restore_ready=false');await assert.rejects(lane.reserve(l,input(origin)),/policy_unavailable/);await admin.query('UPDATE control.health SET restore_ready=true');
 await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",[l.jobId]);
 await assert.rejects(lane.reserve(l,input(origin)),/lease_lost/);
 await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()+interval '30 seconds' WHERE job_id=$1",[l.jobId]);
 await admin.query('UPDATE aios.work_fence SET quarantined=true WHERE crawl_id=$1',[r.id]);await assert.rejects(lane.reserve(l,input(origin)),/run_fenced/);
 await admin.query('UPDATE aios.work_fence SET quarantined=false,deletion_epoch=1 WHERE crawl_id=$1',[r.id]);await assert.rejects(lane.reserve(l,input(origin)),/run_fenced/);
 await admin.query('UPDATE aios.work_fence SET deletion_epoch=0 WHERE crawl_id=$1',[r.id]);
 await admin.query("UPDATE aios.membership SET state='revoked' WHERE tenant_id=$1",[r.p.tenantId]);await assert.rejects(lane.reserve(l,input(origin)),/scope_denied/);
 await admin.query("UPDATE aios.membership SET state='active' WHERE tenant_id=$1",[r.p.tenantId]);
 await deletions.record(r.p.tenantId,r.site);await assert.rejects(lane.reserve(l,input(origin)),/deleted_scope/);
 await commands.cancel(r.p,r.site,r.id);
});
test('HTTP lane dotted DNS names and HTTP/HTTPS aliases share global spacing and concurrency without merging Site scope',async()=>{
 const origins=['https://alias.example','https://alias.example.','http://alias.example'] as const;
 const a=await run(origins[0]),b=await run(origins[1]),c=await run(origins[2]);
 const la=await a.next(),lb=await b.next(),lc=await c.next();
 await assert.rejects(lane.reserve(lb,input(origins[0])),/scope_denied/);
 await assert.rejects(lane.reserve(lc,input(origins[0])),/scope_denied/);
 const first=await lane.reserve(la,input(origins[0]));
 await assert.rejects(lane.reserve(lb,input(origins[1])),/origin_limited/);
 await assert.rejects(lane.reserve(lc,input(origins[2])),/origin_limited/);
 await advance(origins[0]);const second=await lane.reserve(lb,input(origins[1]));
 assert.equal(second.origin,origins[1]);
 await advance(origins[0]);await assert.rejects(lane.reserve(lc,input(origins[2])),/origin_limited/);
 await lane.settle(lb,second.reservationId,0);
 const third=await lane.reserve(lc,input(origins[2]));assert.equal(third.origin,origins[2]);
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origins[0]])).rows[0].in_flight,2);
 assert.equal((await admin.query('SELECT count(*) FROM control.http_origin WHERE origin=ANY($1)',[[origins[1],origins[2]]])).rows[0].count,'0');
 await lane.settle(la,first.reservationId,0);await lane.settle(lc,third.reservationId,0);
 for(const r of [a,b,c])await commands.cancel(r.p,r.site,r.id);
});
test('HTTP lane hard request maximum and tenant quota remain binding',async()=>{
 const origin='https://hard-cap.example',r=await run(origin,750),l=await r.next();
 await worker.reserve(l,'http_requests',750);await assert.rejects(lane.reserve(l,input(origin)),/budget_exhausted/);
 await commands.cancel(r.p,r.site,r.id);
 const next=await run('https://tenant-cap.example'),lease=await next.next();
 await admin.query("UPDATE control.tenant_cap SET amount=0 WHERE tenant_id=$1 AND kind='http_requests'",[next.p.tenantId]);
 await assert.rejects(lane.reserve(lease,input('https://tenant-cap.example')),/budget_exhausted/);
 await commands.cancel(next.p,next.site,next.id);
});
test('HTTP lane run cap includes other reservations and clients have no accounting privileges',async()=>{
 const origin='https://caps.example',r=await run(origin,1),l=await r.next();
 await worker.reserve(l,'http_requests',1);await assert.rejects(lane.reserve(l,input(origin)),/budget_exhausted/);
 await assert.rejects(runtime.query('SELECT * FROM aios.http_reservation'),/permission denied/);
 await assert.rejects(runtime.query('SELECT * FROM control.http_origin'),/permission denied/);
 await assert.rejects(new HttpLane(runtime,deletions).reserve(l,input(origin)),/service_authority_required/);
 await commands.cancel(r.p,r.site,r.id);
});
test('HTTP lane cumulative decoded cap is not reset by settlements',async()=>{
 const origin='https://bytes.example',r=await run(origin);
 for(let i=0;i<50;i++){
  const l=await r.next();await advance(origin);const receipt=await lane.reserve(l,input(origin));await lane.settle(l,receipt.reservationId,0);
 }
 await advance(origin);await assert.rejects(lane.reserve(await r.next(),input(origin,1)),/budget_exhausted/);
 await commands.cancel(r.p,r.site,r.id);
});
test('HTTP accounting and occupied global slots survive PostgreSQL crash/restart without refunds',async()=>{
 const origin='https://crash.example',a=await run(origin,1),b=await run(origin);
 const la=await a.next(),lb=await b.next(),first=await lane.reserve(la,input(origin));
 await advance(origin);const second=await lane.reserve(lb,input(origin));
 const exhausted=await a.next(),blocked=await b.next();
 const totals=async()=>({
  bytes:(await admin.query('SELECT tenant_id,crawl_id,reserved_bytes,actual_bytes FROM aios.http_reservation WHERE origin=$1 ORDER BY tenant_id',[origin])).rows,
  requests:(await admin.query('SELECT tenant_id,crawl_id,amount,actual,state FROM aios.budget_reservation WHERE reservation_id=ANY($1) ORDER BY tenant_id',[[first.reservationId,second.reservationId]])).rows,
  lane:(await admin.query('SELECT * FROM control.http_origin WHERE origin=$1',[origin])).rows,
 });
 const before=await totals();
 assert.equal(before.bytes.length,2);assert.ok(before.bytes.every(r=>r.reserved_bytes==='5242880'&&r.actual_bytes===null));
 assert.ok(before.requests.every(r=>r.amount==='1'&&r.actual==='1'&&r.state==='settled'));
 assert.equal(before.lane[0].in_flight,2);
 await Promise.all([runtime.end(),scheduler.end(),operator.end(),admin.end()]);
 // Restart only the disposable cluster created by scripts/test.mjs, never a user service.
 const data=process.env.AIOS_TEST_DATA!;assert.ok(data.startsWith('/tmp/aios-m1-'));
 execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',data,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart'],{stdio:'pipe'});
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});
 scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});
 deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'http-lane-deletions'));
 ledger=new Ledger(runtime,await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'http-lane-blobs'),'local-synthetic-v1'),'local-synthetic-v1');
 commands=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions);registry=new Registry(operator);lane=new HttpLane(scheduler,deletions);
 assert.deepEqual(await totals(),before);
 await advance(origin);
 await assert.rejects(lane.reserve(exhausted,input(origin)),/budget_exhausted/);
 await assert.rejects(lane.reserve(blocked,input(origin)),/origin_limited/);
 await commands.cancel(a.p,a.site,a.id);
 // Exact trusted accounting receipt remains settleable after cancellation/reconnect;
 // neither a database restart nor an expired/cancelled lease proves a network stop.
 await lane.settle(la,first.reservationId,0);await lane.settle(la,first.reservationId,0);
 assert.equal((await totals()).lane[0].in_flight,1);
 assert.deepEqual((await totals()).requests,before.requests);
 assert.ok((await totals()).bytes.every(r=>r.reserved_bytes==='5242880'));
 const third=await lane.reserve(blocked,input(origin));
 assert.equal((await totals()).lane[0].in_flight,2);
 await lane.settle(lb,second.reservationId,0);await lane.settle(blocked,third.reservationId,0);
 assert.equal((await totals()).lane[0].in_flight,0);
 await commands.cancel(b.p,b.site,b.id);
});
test('HTTP lane immediate release revocation fences new accounting but permits terminal settlement',async()=>{
 const origin='https://revocation.example',r=await run(origin),l=await r.next(),receipt=await lane.reserve(l,input(origin));
 await registry.change(digest,'revoked','fixture');await assert.rejects(lane.reserve(l,input(origin)),/skill_revoked/);
 await lane.settle(l,receipt.reservationId,0);await commands.cancel(r.p,r.site,r.id);
});
