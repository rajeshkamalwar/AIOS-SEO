import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID,generateKeyPairSync,sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer,type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { migrate } from '../packages/persistence/migrate.js';
import { Ledger,type Principal } from '../packages/persistence/index.js';
import { LocalBlobs } from '../packages/evidence/index.js';
import { Registry } from '../packages/skills/index.js';
import { Jobs,type Lease } from '../packages/jobs/index.js';
import { HttpLane } from '../packages/jobs/http-lane.js';
import { HttpSupervisor } from '../packages/jobs/http-supervisor.js';
import { HttpFixtureSupervisor } from '../packages/jobs/http-fixture-supervisor.js';
import { DeletionLedger } from '../packages/policy/deletion.js';
import { canonical,manifestHash,hash } from '../packages/contracts/index.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_http_lane_test'};
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool,supervisorPool:pg.Pool;
let ledger:Ledger,commands:Jobs,worker:Jobs,registry:Registry,deletions:DeletionLedger,lane:HttpLane,supervisor:HttpSupervisor,digest:string;
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
 for(const role of ['aios_scheduler','aios_operator','aios_http_supervisor'])await admin.query(`ALTER ROLE ${role} LOGIN`);
 runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});supervisor=new HttpSupervisor(supervisorPool);
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
after(async()=>{for(const pool of [runtime,scheduler,operator,supervisorPool,admin])await pool?.end();});
const input=(origin:string,maxDecodedBytes=5242880)=>({origin,maxDecodedBytes});
async function advance(origin:string){await admin.query("UPDATE control.http_origin SET last_started_at=clock_timestamp()-interval '2 seconds' WHERE origin=$1",[origin]);}
// Privileged synthetic supervisor fixture only. No process or egress termination is inferred here.
const bindings=new Map<string,{lease:Lease;reservationId:string;invocationId:string;processInstanceId:string;collectorBuildDigest:string;inputContextHash:string;startedAt:string}>();
const terminals=new Map<string,{id:string;actual:number|null;input:any}>();
async function reserve(l:Lease,value:{origin:string;maxDecodedBytes:number}){
 const receipt=await lane.reserve(l,value);
 if(!bindings.has(receipt.reservationId)){
  const binding={lease:l,reservationId:receipt.reservationId,invocationId:receipt.invocationId,processInstanceId:randomUUID(),collectorBuildDigest:manifestHash({fixture:'collector-build'}),inputContextHash:manifestHash({fixture:'invocation',origin:value.origin}),startedAt:new Date().toISOString()};
  bindings.set(receipt.reservationId,binding);await supervisor.bindInvocation(binding);
 }
 return receipt;
}
async function terminal(l:Lease,id:string,actual:number|null){
 const binding=bindings.get(id)!;assert.ok(binding);
 const previous=terminals.get(id);
 const receipt=previous?{...previous.input,actualDecodedBytes:actual}:{...binding,lease:l,finishedAt:new Date().toISOString(),termination:'exited' as const,resultDigest:manifestHash({fixture:'terminal',id}),actualDecodedBytes:actual};
 const receiptId=await supervisor.recordTerminalReceipt(receipt);
 terminals.set(id,{id:receiptId,actual,input:receipt});return receiptId;
}
async function settle(l:Lease,id:string,actual:number|null){await lane.settle(l,id,await terminal(l,id,actual));}
test('HTTP accounting cannot release a slot without an independently retained terminal receipt',async(t)=>{
 const origin='https://no-terminal.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const reservation=await reserve(l,input(origin));
 await assert.rejects(lane.settle(l,reservation.reservationId,randomUUID()),/invalid_receipt/);
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origin])).rows[0].in_flight,1);
});
test('Scheduler cannot directly mutate reservation or origin accounting',async(t)=>{
 const origin='https://direct-accounting.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const reservation=await reserve(l,input(origin));
 for(const sql of ['UPDATE aios.http_reservation SET actual_bytes=0,settled_at=clock_timestamp() WHERE reservation_id=$1',
  'INSERT INTO aios.http_reservation(tenant_id,site_id,crawl_id,job_id,attempt_no,attempt_id,lease_token,reservation_id,origin,reserved_bytes) SELECT tenant_id,site_id,crawl_id,job_id,attempt_no,attempt_id,lease_token,gen_random_uuid(),origin,reserved_bytes FROM aios.http_reservation WHERE reservation_id=$1',
  'DELETE FROM aios.http_reservation WHERE reservation_id=$1',
  'UPDATE control.http_origin SET in_flight=0 WHERE origin=$1',
  "INSERT INTO control.http_origin(origin,last_started_at,in_flight) VALUES($1,'-infinity',0)",
  'DELETE FROM control.http_origin WHERE origin=$1']){
  const c=await scheduler.connect();
  try {await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[l.tenantId]);await assert.rejects(c.query(sql,[sql.includes('http_reservation')?reservation.reservationId:origin]),/permission denied/);}
  finally{await c.query('ROLLBACK');c.release();}
 }
});
test('Supervisor binding and terminal facts are independent, immutable and invocation-scoped',async(t)=>{
 const origin='https://supervised.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const reservation=await reserve(l,input(origin)),binding=bindings.get(reservation.reservationId)!;
 await supervisor.bindInvocation(binding);
 await assert.rejects(supervisor.bindInvocation({...binding,processInstanceId:randomUUID()}),/conflict/);
 await assert.rejects(new HttpSupervisor(scheduler).bindInvocation(binding),/service_authority_required/);
 const terminalInput={...binding,finishedAt:new Date().toISOString(),termination:'exited' as const,resultDigest:manifestHash({fixture:'explicit-terminal'}),actualDecodedBytes:12};
 await assert.rejects(new HttpSupervisor(scheduler).recordTerminalReceipt(terminalInput),/service_authority_required/);
 await assert.rejects(supervisor.recordTerminalReceipt({...terminalInput,invocationId:randomUUID()}),/conflict|invalid_receipt/);
 await assert.rejects(supervisor.recordTerminalReceipt({...terminalInput,finishedAt:'2000-01-01T00:00:00.000Z'}),/invalid_receipt|invalid_input/);
 const receipt=await supervisor.recordTerminalReceipt(terminalInput);assert.equal(await supervisor.recordTerminalReceipt(terminalInput),receipt);
 await assert.rejects(supervisor.recordTerminalReceipt({...terminalInput,actualDecodedBytes:13}),/conflict/);
 await assert.rejects(lane.settle({...l,tenantId:randomUUID()},reservation.reservationId,receipt),/invalid_receipt/);
 await lane.settle(l,reservation.reservationId,receipt);await lane.settle(l,reservation.reservationId,receipt);
 assert.equal((await admin.query('SELECT actual_bytes,settled_at FROM aios.http_reservation WHERE reservation_id=$1',[reservation.reservationId])).rows[0].actual_bytes,'12');
});
test('Unknown decoded bytes settle only with terminal evidence and retain worst-case charges',async(t)=>{
 const origin='https://unknown-bytes.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const reservation=await reserve(l,input(origin));await settle(l,reservation.reservationId,null);await settle(l,reservation.reservationId,null);
 const row=(await admin.query('SELECT actual_bytes,reserved_bytes,settled_at FROM aios.http_reservation WHERE reservation_id=$1',[reservation.reservationId])).rows[0];
 assert.equal(row.actual_bytes,null);assert.equal(row.reserved_bytes,'5242880');assert.ok(row.settled_at);
 assert.equal((await reserve(l,input(origin))).state,'settled');
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origin])).rows[0].in_flight,0);
 const charged=(await admin.query('SELECT amount,actual,state FROM aios.budget_reservation WHERE reservation_id=$1',[reservation.reservationId])).rows[0];assert.deepEqual(charged,{amount:'1',actual:'1',state:'settled'});
});
test('Cancelled unbound reservation cannot gain retrospective execution binding',async()=>{
 const origin='https://unbound-cancel.example',r=await run(origin),l=await r.next();
 const reservation=await lane.reserve(l,input(origin));await commands.cancel(r.p,r.site,r.id);
 await assert.rejects(supervisor.bindInvocation({lease:l,reservationId:reservation.reservationId,invocationId:reservation.invocationId,processInstanceId:randomUUID(),collectorBuildDigest:manifestHash({fixture:true}),inputContextHash:manifestHash({fixture:true}),startedAt:new Date().toISOString()}),/run_fenced|lease_lost|invalid_receipt/);
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origin])).rows[0].in_flight,1);
});
test('Direct scheduler SQL cannot refund or rewrite the charged HTTP attempt',async(t)=>{
 const origin='https://immutable-charge.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const reservation=await reserve(l,input(origin));
 for(const mutation of ["UPDATE aios.budget_reservation SET actual=0 WHERE reservation_id=$1","UPDATE aios.budget_reservation SET amount=0 WHERE reservation_id=$1","UPDATE aios.budget_reservation SET state='reserved',actual=NULL WHERE reservation_id=$1","DELETE FROM aios.budget_reservation WHERE reservation_id=$1"]){
  const c=await scheduler.connect();
  try {await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[l.tenantId]);await assert.rejects(c.query(mutation,[reservation.reservationId]),/immutable|permission denied|accounting_integrity|policy_blocked/);}
  finally {await c.query('ROLLBACK');c.release();}
 }
});
async function directReserve(l:Lease,origin:string){
 const id=randomUUID();
 return scheduler.query('SELECT control.reserve_http_accounting($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,origin,5242880,id,manifestHash({id,actual:1})]);
}
async function accountingState(l:Lease,origin:string){return {
 reservations:(await admin.query('SELECT * FROM aios.http_reservation WHERE tenant_id=$1 AND crawl_id=$2 ORDER BY reservation_id',[l.tenantId,l.runId])).rows,
 charges:(await admin.query('SELECT * FROM aios.budget_reservation WHERE tenant_id=$1 AND crawl_id=$2 ORDER BY reservation_id',[l.tenantId,l.runId])).rows,
 origin:(await admin.query('SELECT * FROM control.http_origin WHERE origin=$1',[origin])).rows,
};}
test('Direct SQL reservation checks current health and membership before any accounting mutation',async(t)=>{
 const origin='https://sql-gates.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const before=await accountingState(l,origin);
 await admin.query('UPDATE control.health SET restore_ready=false');
 try {await assert.rejects(directReserve(l,origin),/policy_unavailable/);assert.deepEqual(await accountingState(l,origin),before);}
 finally {await admin.query('UPDATE control.health SET restore_ready=true');}
 await admin.query("UPDATE aios.membership SET state='revoked' WHERE tenant_id=$1 AND user_id=$2",[r.p.tenantId,r.p.userId]);
 try {await assert.rejects(directReserve(l,origin),/scope_denied/);assert.deepEqual(await accountingState(l,origin),before);}
 finally {await admin.query("UPDATE aios.membership SET state='active' WHERE tenant_id=$1 AND user_id=$2",[r.p.tenantId,r.p.userId]);}
});
test('Legacy unbound reservation state cannot acquire retroactive invocation or release its occupied slot',async(t)=>{
 const origin='https://legacy-invocation.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const reservation=await lane.reserve(l,input(origin));assert.match(reservation.invocationId,/^[0-9a-f-]{36}$/);
 // Owner-only fixture models the NULL produced by migration016 for pre-existing
 // rows. This verifies the legacy state boundary, not a real historical upgrade.
 await admin.query('UPDATE aios.http_reservation SET invocation_id=NULL WHERE reservation_id=$1',[reservation.reservationId]);
 const before=await accountingState(l,origin);
 await assert.rejects(lane.reserve(l,input(origin)),/legacy_invocation_unverified/);
 const binding={lease:l,reservationId:reservation.reservationId,invocationId:reservation.invocationId,processInstanceId:randomUUID(),collectorBuildDigest:manifestHash({fixture:true}),inputContextHash:manifestHash({fixture:true}),startedAt:new Date().toISOString()};
 await assert.rejects(supervisor.bindInvocation(binding),/invalid_receipt/);
 await assert.rejects(supervisor.recordTerminalReceipt({...binding,finishedAt:new Date().toISOString(),termination:'exited',resultDigest:manifestHash({fixture:true}),actualDecodedBytes:null}),/invalid_receipt/);
 await assert.rejects(lane.settle(l,reservation.reservationId,randomUUID()),/invalid_receipt/);
 assert.deepEqual(await accountingState(l,origin),before);assert.equal(before.origin[0].in_flight,1);
});
test('HTTP lane atomic idempotency, no refund and settlement integrity',async()=>{
 const origin='https://accounting.example',r=await run(origin),l=await r.next();
 const [a,b]=await Promise.all([reserve(l,input(origin)),reserve(l,input(origin))]);assert.deepEqual(a,b);
 await assert.rejects(reserve(l,input(origin,4)),/conflict/);
 await assert.rejects(terminal(l,a.reservationId,5242881),/invalid_receipt/);
 await assert.rejects(lane.settle({...l,token:randomUUID()},a.reservationId,randomUUID()),/invalid_receipt/);
 await settle(l,a.reservationId,1);await settle(l,a.reservationId,1);
 assert.equal((await reserve(l,input(origin))).state,'settled');
 await assert.rejects(terminal(l,a.reservationId,2),/conflict/);
 await assert.rejects(worker.settle(l,a.reservationId,0),/conflict/);
 assert.equal((await admin.query('SELECT reserved_bytes FROM aios.http_reservation WHERE reservation_id=$1',[a.reservationId])).rows[0].reserved_bytes,'5242880');
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origin])).rows[0].in_flight,0);
 await commands.cancel(r.p,r.site,r.id);
});
test('HTTP lane global origin spacing and two concurrent requests across tenants survive reconnect',async()=>{
 const origin='https://shared.example',a=await run(origin),b=await run(origin),la=await a.next(),lb=await b.next();
 const first=await reserve(la,input(origin));
 await assert.rejects(reserve(lb,input(origin)),/origin_limited/);
 await advance(origin);const second=await reserve(lb,input(origin));
 const third=await a.next();await advance(origin);
 const reopened=new HttpLane(scheduler,deletions);
 await assert.rejects(reopened.reserve(third,input(origin)),/origin_limited/);
 await commands.cancel(a.p,a.site,a.id);
 await assert.rejects(reopened.reserve(third,input(origin)),/run_fenced/);
 await settle(la,first.reservationId,0);await settle(lb,second.reservationId,0);
 assert.equal((await admin.query('SELECT count(*) FROM aios.http_reservation WHERE tenant_id=$1',[a.p.tenantId])).rows[0].count,'1');
 await commands.cancel(b.p,b.site,b.id);
});
test('HTTP lane rejects forged scope, expired lease, unhealthy policy, revoked membership and deletion',async()=>{
 const origin='https://fences.example',r=await run(origin),l=await r.next();
 await assert.rejects(reserve(l,input('https://elsewhere.example')),/scope_denied/);
 await assert.rejects(reserve({...l,siteId:randomUUID()},input(origin)),/run_fenced/);
 await assert.rejects(reserve({...l,attemptId:randomUUID()},input(origin)),/lease_lost/);
 await assert.rejects(reserve(l,input(origin,5242881)),/invalid_input/);
 await admin.query('UPDATE control.health SET restore_ready=false');await assert.rejects(reserve(l,input(origin)),/policy_unavailable/);await admin.query('UPDATE control.health SET restore_ready=true');
 await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",[l.jobId]);
 await assert.rejects(reserve(l,input(origin)),/lease_lost/);
 await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()+interval '30 seconds' WHERE job_id=$1",[l.jobId]);
 await admin.query('UPDATE aios.work_fence SET quarantined=true WHERE crawl_id=$1',[r.id]);await assert.rejects(reserve(l,input(origin)),/run_fenced/);
 await admin.query('UPDATE aios.work_fence SET quarantined=false,deletion_epoch=1 WHERE crawl_id=$1',[r.id]);await assert.rejects(reserve(l,input(origin)),/run_fenced/);
 await admin.query('UPDATE aios.work_fence SET deletion_epoch=0 WHERE crawl_id=$1',[r.id]);
 await admin.query("UPDATE aios.membership SET state='revoked' WHERE tenant_id=$1",[r.p.tenantId]);await assert.rejects(reserve(l,input(origin)),/scope_denied/);
 await admin.query("UPDATE aios.membership SET state='active' WHERE tenant_id=$1",[r.p.tenantId]);
 await deletions.record(r.p.tenantId,r.site);await assert.rejects(reserve(l,input(origin)),/deleted_scope/);
 await commands.cancel(r.p,r.site,r.id);
});
test('HTTP lane dotted DNS names and HTTP/HTTPS aliases share global spacing and concurrency without merging Site scope',async()=>{
 const origins=['https://alias.example','https://alias.example.','http://alias.example'] as const;
 const a=await run(origins[0]),b=await run(origins[1]),c=await run(origins[2]);
 const la=await a.next(),lb=await b.next(),lc=await c.next();
 await assert.rejects(reserve(lb,input(origins[0])),/scope_denied/);
 await assert.rejects(reserve(lc,input(origins[0])),/scope_denied/);
 const first=await reserve(la,input(origins[0]));
 await assert.rejects(reserve(lb,input(origins[1])),/origin_limited/);
 await assert.rejects(reserve(lc,input(origins[2])),/origin_limited/);
 await advance(origins[0]);const second=await reserve(lb,input(origins[1]));
 assert.equal(second.origin,origins[1]);
 await advance(origins[0]);await assert.rejects(reserve(lc,input(origins[2])),/origin_limited/);
 await settle(lb,second.reservationId,0);
 const third=await reserve(lc,input(origins[2]));assert.equal(third.origin,origins[2]);
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origins[0]])).rows[0].in_flight,2);
 assert.equal((await admin.query('SELECT count(*) FROM control.http_origin WHERE origin=ANY($1)',[[origins[1],origins[2]]])).rows[0].count,'0');
 await settle(la,first.reservationId,0);await settle(lc,third.reservationId,0);
 for(const r of [a,b,c])await commands.cancel(r.p,r.site,r.id);
});
test('HTTP lane hard request maximum and tenant quota remain binding',async()=>{
 const origin='https://hard-cap.example',r=await run(origin,750),l=await r.next();
 await worker.reserve(l,'http_requests',750);await assert.rejects(reserve(l,input(origin)),/budget_exhausted/);
 await commands.cancel(r.p,r.site,r.id);
 const next=await run('https://tenant-cap.example'),lease=await next.next();
 await admin.query("UPDATE control.tenant_cap SET amount=0 WHERE tenant_id=$1 AND kind='http_requests'",[next.p.tenantId]);
 await assert.rejects(reserve(lease,input('https://tenant-cap.example')),/budget_exhausted/);
 await commands.cancel(next.p,next.site,next.id);
});
test('HTTP lane run cap includes other reservations and clients have no accounting privileges',async()=>{
 const origin='https://caps.example',r=await run(origin,1),l=await r.next();
 await worker.reserve(l,'http_requests',1);await assert.rejects(reserve(l,input(origin)),/budget_exhausted/);
 await assert.rejects(runtime.query('SELECT * FROM aios.http_reservation'),/permission denied/);
 await assert.rejects(runtime.query('SELECT * FROM control.http_origin'),/permission denied/);
 await assert.rejects(new HttpLane(runtime,deletions).reserve(l,input(origin)),/service_authority_required/);
 await commands.cancel(r.p,r.site,r.id);
});
test('HTTP lane cumulative decoded cap is not reset by settlements',async()=>{
 const origin='https://bytes.example',r=await run(origin);
 for(let i=0;i<50;i++){
  const l=await r.next();await advance(origin);const receipt=await reserve(l,input(origin));await settle(l,receipt.reservationId,0);
 }
 await advance(origin);await assert.rejects(reserve(await r.next(),input(origin,1)),/budget_exhausted/);
 await commands.cancel(r.p,r.site,r.id);
});
test('HTTP accounting and occupied global slots survive PostgreSQL crash/restart without refunds',async()=>{
 const origin='https://crash.example',a=await run(origin,1),b=await run(origin);
 const la=await a.next(),lb=await b.next(),first=await reserve(la,input(origin));
 await advance(origin);const second=await reserve(lb,input(origin));
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
 await Promise.all([runtime.end(),scheduler.end(),operator.end(),supervisorPool.end(),admin.end()]);
 // Restart only the disposable cluster created by scripts/test.mjs, never a user service.
 const data=process.env.AIOS_TEST_DATA!;assert.ok(data.startsWith('/tmp/aios-m1-'));
 execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',data,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart'],{stdio:'pipe'});
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});
 scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});supervisor=new HttpSupervisor(supervisorPool);
 deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'http-lane-deletions'));
 ledger=new Ledger(runtime,await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'http-lane-blobs'),'local-synthetic-v1'),'local-synthetic-v1');
 commands=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions);registry=new Registry(operator);lane=new HttpLane(scheduler,deletions);
 assert.deepEqual(await totals(),before);
 await advance(origin);
 await assert.rejects(reserve(exhausted,input(origin)),/budget_exhausted/);
 await assert.rejects(reserve(blocked,input(origin)),/origin_limited/);
 await commands.cancel(a.p,a.site,a.id);
 // Exact trusted accounting receipt remains settleable after cancellation/reconnect;
 // neither a database restart nor an expired/cancelled lease proves a network stop.
 await settle(la,first.reservationId,0);await settle(la,first.reservationId,0);
 assert.equal((await totals()).lane[0].in_flight,1);
 assert.deepEqual((await totals()).requests,before.requests);
 assert.ok((await totals()).bytes.every(r=>r.reserved_bytes==='5242880'));
 const third=await reserve(blocked,input(origin));
 assert.equal((await totals()).lane[0].in_flight,2);
 await settle(lb,second.reservationId,0);await settle(blocked,third.reservationId,0);
 assert.equal((await totals()).lane[0].in_flight,0);
 await commands.cancel(b.p,b.site,b.id);
});
async function localFixture(handler:RequestListener){
 const server=createServer(handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {port:(server.address() as AddressInfo).port,close:async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
test('Fixture supervisor performs one real robots GET, retains no response body and settles unknown actual bytes',async(t)=>{
 const origin='https://process-normal.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const body=Buffer.from('User-agent: *\nDisallow: /private\n');let requests=0;
 const fixture=await localFixture((req,res)=>{requests++;assert.equal(req.method,'GET');assert.equal(req.url,'/robots.txt');assert.equal(req.headers.host,`127.0.0.1:${fixture.port}`);res.writeHead(200,{'content-type':'text/plain'});res.end(body);});t.after(()=>fixture.close());
 const producer=new HttpFixtureSupervisor(lane,supervisor);
 const receipt=await producer.collect(l,{url:origin+'/robots.txt',fixturePort:fixture.port,maxDecodedBytes:1000,timeoutMs:5000},{wallTimeoutMs:8000});
 assert.equal(receipt.state,'completed');assert.equal(receipt.result?.status,200);assert.equal(receipt.result?.retainedBodyBytes,body.length);assert.equal(receipt.result?.retainedBodySha256,hash(body));assert.equal(requests,1);
 assert.ok(!JSON.stringify(receipt).includes('Disallow: /private'));
 assert.throws(()=>process.kill(receipt.processId,0));
 const stored=(await admin.query('SELECT actual_bytes,reserved_bytes,settled_at FROM aios.http_reservation WHERE reservation_id=$1',[receipt.reservation.reservationId])).rows[0];assert.equal(stored.actual_bytes,null);assert.equal(stored.reserved_bytes,'1000');assert.ok(stored.settled_at);
 await lane.settle(l,receipt.reservation.reservationId,receipt.terminalReceiptId);
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origin])).rows[0].in_flight,0);
});
test('Fixture supervisor confirms process exit for transport failure without inventing HTTP success',async(t)=>{
 const origin='https://process-error.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 let requests=0;const fixture=await localFixture((req)=>{requests++;req.socket.destroy();});t.after(()=>fixture.close());
 const receipt=await new HttpFixtureSupervisor(lane,supervisor).collect(l,{url:origin+'/robots.txt',fixturePort:fixture.port,maxDecodedBytes:1000,timeoutMs:5000},{wallTimeoutMs:8000});
 assert.equal(receipt.state,'failed');assert.equal(receipt.result,null);assert.equal(requests,1);assert.throws(()=>process.kill(receipt.processId,0));
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origin])).rows[0].in_flight,0);
});
test('Fixture supervisor deadline kills a real hanging request and closes its loopback socket before terminal settlement',async(t)=>{
 const origin='https://process-hang.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 let requests=0,closed=0;let socketClosed!:()=>void;const closeObserved=new Promise<void>(resolve=>socketClosed=resolve);
 const fixture=await localFixture(req=>{requests++;req.socket.once('close',()=>{closed++;socketClosed();});});t.after(()=>fixture.close());
 const receipt=await new HttpFixtureSupervisor(lane,supervisor).collect(l,{url:origin+'/robots.txt',fixturePort:fixture.port,maxDecodedBytes:1000,timeoutMs:20000},{wallTimeoutMs:2500});
 assert.equal(receipt.state,'timeout');assert.equal(receipt.result,null);assert.equal(requests,1);assert.throws(()=>process.kill(receipt.processId,0));
 await Promise.race([closeObserved,new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture_socket_not_closed')),1000);timer.unref();})]);assert.equal(closed,1);
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origin])).rows[0].in_flight,0);
 const row=(await admin.query('SELECT actual_bytes,reserved_bytes FROM aios.http_reservation WHERE reservation_id=$1',[receipt.reservation.reservationId])).rows[0];assert.equal(row.actual_bytes,null);assert.equal(row.reserved_bytes,'1000');
});
test('Fixture supervisor cannot turn a prebound unknown process into its own terminal witness',async(t)=>{
 const origin='https://process-unknown.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const reserved=await reserve(l,input(origin,1000));let requests=0;
 const fixture=await localFixture((_,res)=>{requests++;res.end('must not request');});t.after(()=>fixture.close());
 await assert.rejects(new HttpFixtureSupervisor(lane,supervisor).collect(l,{url:origin+'/robots.txt',fixturePort:fixture.port,maxDecodedBytes:1000,timeoutMs:5000},{wallTimeoutMs:8000}),/conflict/);
 assert.equal(requests,0);assert.equal((await admin.query('SELECT count(*) FROM aios.http_terminal_receipt WHERE reservation_id=$1',[reserved.reservationId])).rows[0].count,'0');
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origin])).rows[0].in_flight,1);
});
test('Fixture supervisor rechecks cancellation after binding before allowing its robots request',async(t)=>{
 const origin='https://process-cancel.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));let requests=0;
 const fixture=await localFixture((_,res)=>{requests++;res.end('not authorized');});t.after(()=>fixture.close());
 class CancellingSupervisor extends HttpSupervisor {override async bindInvocation(binding:Parameters<HttpSupervisor['bindInvocation']>[0]){await super.bindInvocation(binding);await commands.cancel(r.p,r.site,r.id);}}
 const receipt=await new HttpFixtureSupervisor(lane,new CancellingSupervisor(supervisorPool)).collect(l,{url:origin+'/robots.txt',fixturePort:fixture.port,maxDecodedBytes:1000,timeoutMs:5000},{wallTimeoutMs:8000});
 assert.equal(receipt.state,'failed');assert.equal(receipt.result,null);assert.equal(requests,0);assert.throws(()=>process.kill(receipt.processId,0));
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origin])).rows[0].in_flight,0);
});
test('Fixture child starts with empty environment despite hostile NODE_OPTIONS and parent secrets',async(t)=>{
 const origin='https://process-environment.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const fixture=await localFixture((_,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.end('User-agent: *');});t.after(()=>fixture.close());
 const oldOptions=process.env.NODE_OPTIONS,oldSecret=process.env.AIOS_FIXTURE_SECRET;
 try {
  process.env.NODE_OPTIONS='--require=/nonexistent-must-not-inherit.js';process.env.AIOS_FIXTURE_SECRET='fixture-secret-must-not-enter-child';
  const receipt=await new HttpFixtureSupervisor(lane,supervisor).collect(l,{url:origin+'/robots.txt',fixturePort:fixture.port,maxDecodedBytes:1000,timeoutMs:5000},{wallTimeoutMs:8000});
  assert.equal(receipt.state,'completed');assert.ok(!JSON.stringify(receipt).includes('fixture-secret'));
 } finally {
  if(oldOptions===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=oldOptions;
  if(oldSecret===undefined)delete process.env.AIOS_FIXTURE_SECRET;else process.env.AIOS_FIXTURE_SECRET=oldSecret;
 }
});
test('Fixture supervisor never rewrites an earlier process close into post-binding terminal proof',async(t)=>{
 const origin='https://process-delayed-binding.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));let requests=0;
 const fixture=await localFixture((_,res)=>{requests++;res.end('not authorized');});t.after(()=>fixture.close());
 const controller=new AbortController();
 class DelayedSupervisor extends HttpSupervisor {override async bindInvocation(binding:Parameters<HttpSupervisor['bindInvocation']>[0]){controller.abort();await new Promise(resolve=>setTimeout(resolve,300));await super.bindInvocation(binding);}}
 await assert.rejects(new HttpFixtureSupervisor(lane,new DelayedSupervisor(supervisorPool)).collect(l,{url:origin+'/robots.txt',fixturePort:fixture.port,maxDecodedBytes:1000,timeoutMs:5000},{signal:controller.signal,wallTimeoutMs:8000}),/invalid_receipt/);
 assert.equal(requests,0);assert.equal((await admin.query('SELECT count(*) FROM aios.http_terminal_receipt WHERE tenant_id=$1',[l.tenantId])).rows[0].count,'0');
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origin])).rows[0].in_flight,1);
});
test('Fixture AbortSignal cancels a real hanging child and settles only after socket termination',async(t)=>{
 const origin='https://process-abort.example',r=await run(origin),l=await r.next();t.after(()=>commands.cancel(r.p,r.site,r.id));
 const controller=new AbortController();let requests=0,closed=0;let socketClosed!:()=>void;const closedPromise=new Promise<void>(resolve=>socketClosed=resolve);
 const fixture=await localFixture(req=>{requests++;req.socket.once('close',()=>{closed++;socketClosed();});controller.abort();});t.after(()=>fixture.close());
 const producer=new HttpFixtureSupervisor(lane,supervisor),task={url:origin+'/robots.txt',fixturePort:fixture.port,maxDecodedBytes:1000,timeoutMs:20000};
 const preAborted=new AbortController();preAborted.abort();await assert.rejects(producer.collect(l,task,{signal:preAborted.signal}),/aborted/);
 assert.equal((await admin.query('SELECT count(*) FROM aios.http_reservation WHERE tenant_id=$1',[l.tenantId])).rows[0].count,'0');
 const receipt=await producer.collect(l,task,{signal:controller.signal,wallTimeoutMs:8000});assert.equal(receipt.state,'aborted');assert.equal(receipt.result,null);assert.equal(requests,1);assert.throws(()=>process.kill(receipt.processId,0));
 await Promise.race([closedPromise,new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture_socket_not_closed')),1000);timer.unref();})]);assert.equal(closed,1);
 const stored=(await admin.query('SELECT actual_bytes,reserved_bytes,settled_at FROM aios.http_reservation WHERE reservation_id=$1',[receipt.reservation.reservationId])).rows[0];assert.equal(stored.actual_bytes,null);assert.equal(stored.reserved_bytes,'1000');assert.ok(stored.settled_at);
 await lane.settle(l,receipt.reservation.reservationId,receipt.terminalReceiptId);
 assert.equal((await admin.query('SELECT in_flight FROM control.http_origin WHERE origin=$1',[origin])).rows[0].in_flight,0);
});
test('HTTP lane immediate release revocation fences new accounting but permits terminal settlement',async()=>{
 const origin='https://revocation.example',r=await run(origin),l=await r.next(),receipt=await reserve(l,input(origin));
 const next=await r.next(),before=await accountingState(next,origin);
 await registry.change(digest,'revoked','fixture');await assert.rejects(reserve(l,input(origin)),/skill_revoked/);
 await assert.rejects(directReserve(next,origin),/skill_revoked/);assert.deepEqual(await accountingState(next,origin),before);
 await settle(l,receipt.reservationId,0);await commands.cancel(r.p,r.site,r.id);
});
