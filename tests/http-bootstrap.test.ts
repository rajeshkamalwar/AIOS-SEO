import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID,generateKeyPairSync,sign } from 'node:crypto';
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync,spawnSync } from 'node:child_process';
import { createServer,type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { migrate } from '../packages/persistence/migrate.js';
import { Ledger,type Principal } from '../packages/persistence/index.js';
import { LocalBlobs } from '../packages/evidence/index.js';
import { Registry } from '../packages/skills/index.js';
import { Jobs,type Lease } from '../packages/jobs/index.js';
import { HttpLane } from '../packages/jobs/http-lane.js';
import { HttpSupervisor } from '../packages/jobs/http-supervisor.js';
import { IsolatedHttpFixtureSupervisor } from '../packages/jobs/isolated-http-fixture-supervisor.js';
import { DockerHttpFixtureEngine,type HttpFixtureEngine } from '../packages/jobs/docker-http-fixture.js';
import { DeletionLedger } from '../packages/policy/deletion.js';
import { canonical,manifestHash,hash } from '../packages/contracts/index.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_http_bootstrap_test'};
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool,supervisorPool:pg.Pool;
let ledger:Ledger,commands:Jobs,worker:Jobs,registry:Registry,deletions:DeletionLedger,lane:HttpLane,supervisor:HttpSupervisor,digest:string,httpDigest:string;
async function fixture(type:string,changes:Record<string,unknown>){
 const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes};
 const table=({Tenant:'tenant',User:'app_user',Membership:'membership'} as Record<string,string>)[type];
 const entries=Object.entries(row).filter(([k])=>!['provenance_ids','site_scope_ids'].includes(k));
 await admin.query(`INSERT INTO aios.${table} (${entries.map(([k])=>k).join(',')}) VALUES(${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));
}
async function run(origin:string,requests=750,includeScope=true){
 const p:Principal={tenantId:randomUUID(),userId:randomUUID()};
 await fixture('Tenant',{id:p.tenantId});await fixture('User',{id:p.userId,subject:p.userId});await fixture('Membership',{id:randomUUID(),tenant_id:p.tenantId,user_id:p.userId});
 for(const kind of ['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'])await admin.query('INSERT INTO control.tenant_cap VALUES($1,$2,10000)',[p.tenantId,kind]);
 const fixtureOrigin='https://'+new URL(origin).hostname.replace(/\.$/,'');
 const site=await ledger.registerSite(p,fixtureOrigin+'/');
 const evidence=await ledger.accept(p,site,{attemptId:randomUUID(),sourceUri:fixtureOrigin+'/',capturedAt:new Date(Date.now()-1000).toISOString(),mimeType:'text/html',contextHash:manifestHash({fixture:true})},Buffer.from('fixture'));
 // Fixture profile admission intentionally excludes HTTP/trailing-dot spelling; seed
 // canonical url-v1 Site variants with test-owner authority to exercise accounting only.
 if(fixtureOrigin!==origin)await admin.query('UPDATE aios.site SET submitted_url=$2,normalized_origin=$3,origins=$4 WHERE id=$1',[site,origin+'/',origin,[origin]]);
 const id=await commands.submit(p,site,randomUUID(),{http_requests:requests,render_requests:0,render_pages:0,model_calls:0,tokens:0,cost_microusd:0,deadline:new Date(Date.now()+600000).toISOString()});
 const scope=await ledger.acceptSiteScopeFixture(p,site,id,deletions);
 const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),includeScope?[evidence.evidenceId,scope.evidenceId]:[evidence.evidenceId],includeScope?[evidence.observationId,scope.observationId]:[evidence.observationId]);
 const parent=async()=>{await commands.enqueue(p,site,id,bundle,digest,randomUUID(),'project');const l=await worker.claim();assert.ok(l);return l;};
 const next=async()=>{const l=await parent(),child=await worker.enqueueHttpBootstrapFixture(l,httpDigest,randomUUID()),fetch=await worker.claim();assert.ok(fetch);assert.equal(fetch.jobId,child);return fetch;};
 return {p,site,id,next,parent,scope,bundle};
}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_http_bootstrap_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator','aios_http_supervisor'])await admin.query(`ALTER ROLE ${role} LOGIN`);
 runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});supervisor=new HttpSupervisor(supervisorPool);
 const blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'http-bootstrap-blobs'),'local-synthetic-v1');ledger=new Ledger(runtime,blobs,'local-synthetic-v1');
 deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'http-bootstrap-deletions'));
 commands=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions,blobs);registry=new Registry(operator);lane=new HttpLane(scheduler,deletions);
 await admin.query("UPDATE control.health SET verified_until=clock_timestamp()+interval '1 hour',restore_ready=true");
 const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID();
 await admin.query('INSERT INTO control.authority_key VALUES($1,$2,true)',[reviewer,keys.publicKey.export({type:'spki',format:'pem'})]);
 const manifest=JSON.parse(await readFile('spec/examples/skill-reliability-gate.json','utf8'));
 manifest.last_verified=new Date().toISOString();manifest.freshness_deadline=new Date(Date.now()+3600000).toISOString();
 const approval={author:randomUUID(),reviewer,manifest_digest:manifestHash(manifest),evaluation_digest:manifestHash({fixture:true}),approved_at:new Date().toISOString(),scope:'local-synthetic-v1' as const,dependencies:[]};
 digest=await registry.approve(manifest,approval,sign(null,Buffer.from(canonical(approval)),keys.privateKey).toString('base64'));
 const http=JSON.parse(await readFile('spec/examples/skill-http-bootstrap-fixture.json','utf8'));http.last_verified=new Date().toISOString();http.freshness_deadline=new Date(Date.now()+3600000).toISOString();
 const httpApproval={...approval,author:randomUUID(),manifest_digest:manifestHash(http)};httpDigest=await registry.approve(http,httpApproval,sign(null,Buffer.from(canonical(httpApproval)),keys.privateKey).toString('base64'));
});
after(async()=>{for(const pool of [runtime,scheduler,operator,supervisorPool,admin])await pool?.end();});
const origin=()=>`https://${randomUUID()}.example`;
async function scenario(){const r=await run(origin()),parent=await r.parent();return {...r,parent};}
async function child(r:Awaited<ReturnType<typeof scenario>>,key=randomUUID()){const id=await worker.enqueueHttpBootstrapFixture(r.parent,httpDigest,key),lease=await worker.claim();assert.ok(lease);assert.equal(lease.jobId,id);return lease;}
async function counts(){return (await admin.query('SELECT (SELECT count(*) FROM aios.evidence) evidence,(SELECT count(*) FROM aios.observation) observations,(SELECT count(*) FROM aios.http_reservation) reservations,(SELECT count(*) FROM aios.http_terminal_receipt) terminals')).rows[0];}
test('Bootstrap child pins current scope and frozen bundle in an immutable bounded GET descriptor',async t=>{
 const r=await scenario();t.after(()=>commands.cancel(r.p,r.site,r.id));const before=await counts(),key=randomUUID();
 const id=await worker.enqueueHttpBootstrapFixture(r.parent,httpDigest,key);assert.equal(await worker.enqueueHttpBootstrapFixture(r.parent,httpDigest,key),id);
 const lease=await worker.claim();assert.ok(lease);assert.equal(lease.jobId,id);assert.equal((await admin.query('SELECT kind FROM aios.job WHERE job_id=$1',[lease.jobId])).rows[0].kind,'fetch');const descriptor=await worker.prepareHttpBootstrapExecution(lease);
 assert.equal(descriptor.url,(await admin.query('SELECT normalized_origin FROM aios.site WHERE id=$1',[r.site])).rows[0].normalized_origin+'/robots.txt');
 assert.equal(descriptor.method,'GET');assert.equal(descriptor.maxDecodedBytes,512000);assert.equal(descriptor.timeoutMs,20000);assert.equal(descriptor.profile,'isolated-http-fixture-v1');assert.ok(descriptor.scopeEvidenceId);assert.ok(descriptor.scopeObservationId);assert.match(descriptor.scopeSha256,/^[a-f0-9]{64}$/);
 await worker.assertHttpBootstrapExecution(lease,descriptor);assert.deepEqual(await counts(),before);
 await assert.rejects(worker.prepareHttpBootstrapExecution(r.parent),/handler_not_installed|authority|permission/);
});
test('Bootstrap admission requires a current parent project lease and exact installed HTTP permission',async t=>{
 const r=await scenario();t.after(()=>commands.cancel(r.p,r.site,r.id));
 await assert.rejects(worker.enqueueHttpBootstrapFixture({...r.parent,token:randomUUID()},httpDigest,randomUUID()),/lease_lost/);
 await assert.rejects(worker.enqueueHttpBootstrapFixture({...r.parent,tenantId:randomUUID()},httpDigest,randomUUID()),/lease_lost|scope_denied|run_fenced/);
 await assert.rejects(worker.enqueueHttpBootstrapFixture(r.parent,digest,randomUUID()),/handler_not_installed|permission|authority/);
 const lease=await child(r);await assert.rejects(worker.enqueueHttpBootstrapFixture(lease,httpDigest,randomUUID()),/handler_not_installed|authority|permission/);
 await assert.rejects(worker.complete(lease,randomUUID()),/handler_not_installed/);
});
test('Generic project leases cannot launch the HTTP container or reserve physical work',async t=>{
 const r=await scenario();t.after(()=>commands.cancel(r.p,r.site,r.id));let created=0;
 const engine:HttpFixtureEngine={async create(){created++;throw new Error('must_not_create');},async start(){throw new Error('must_not_start');},async cleanup(){throw new Error('must_not_cleanup');}};
 const before=await counts();await assert.rejects(new IsolatedHttpFixtureSupervisor(worker,lane,supervisor,engine).collect(r.parent,{fixturePort:12345}),/handler_not_installed|authority|permission/);assert.equal(created,0);assert.deepEqual(await counts(),before);
});
test('Bootstrap descriptor mutation, stale membership, deletion and cancellation fail before execution',async t=>{
 for(const fence of ['descriptor','membership','deletion','cancel'] as const){const r=await scenario();t.after(()=>commands.cancel(r.p,r.site,r.id));const lease=await child(r),d=await worker.prepareHttpBootstrapExecution(lease);
  if(fence==='descriptor'){await assert.rejects(worker.assertHttpBootstrapExecution(lease,{...d,url:d.url.replace('/robots.txt','/page')}),/source_context_changed|conflict|invalid|descriptor/);continue;}
  if(fence==='membership')await admin.query("UPDATE aios.membership SET state='revoked' WHERE tenant_id=$1",[r.p.tenantId]);
  if(fence==='deletion')await deletions.record(r.p.tenantId,r.site);
  if(fence==='cancel')await commands.cancel(r.p,r.site,r.id);
  await assert.rejects(worker.prepareHttpBootstrapExecution(lease),/scope_denied|deleted_scope|run_fenced|lease_lost/);
  if(fence==='membership')await admin.query("UPDATE aios.membership SET state='active' WHERE tenant_id=$1",[r.p.tenantId]);
 }
});
test('Bootstrap reservation max_calls=1 stays spent across retry attempts and never refunds unknown bytes',async t=>{
 const r=await scenario();t.after(()=>commands.cancel(r.p,r.site,r.id));const lease=await child(r),d=await worker.prepareHttpBootstrapExecution(lease),before=await counts();
 const reservation=await lane.reserve(lease,{origin:d.origin,maxDecodedBytes:d.maxDecodedBytes});assert.deepEqual(await lane.reserve(lease,{origin:d.origin,maxDecodedBytes:d.maxDecodedBytes}),reservation);
 await worker.fail(lease,'timeout',true);await admin.query('UPDATE aios.job SET available_at=clock_timestamp() WHERE job_id=$1',[lease.jobId]);const retry=await worker.claim();assert.ok(retry);assert.equal(retry.jobId,lease.jobId);assert.equal(retry.attempt,lease.attempt+1);
 await assert.rejects(lane.reserve(retry,{origin:d.origin,maxDecodedBytes:d.maxDecodedBytes}),/budget_exhausted|call_budget/);
 const row=(await admin.query('SELECT reserved_bytes,actual_bytes,settled_at FROM aios.http_reservation WHERE reservation_id=$1',[reservation.reservationId])).rows[0];assert.deepEqual(row,{reserved_bytes:'512000',actual_bytes:null,settled_at:null});assert.equal((await counts()).terminals,before.terminals);
});
test('Scheduler cannot modify descriptor or insert an ungoverned fetch child directly',async t=>{
 const r=await scenario();t.after(()=>commands.cancel(r.p,r.site,r.id));const lease=await child(r),c=await scheduler.connect();
 for(const [sql,args] of [
  ['UPDATE aios.http_bootstrap_job SET descriptor=$2 WHERE job_id=$1',[lease.jobId,'{}']],
  ["INSERT INTO aios.job SELECT (jsonb_populate_record(NULL::aios.job,to_jsonb(j)||jsonb_build_object('job_id',gen_random_uuid(),'idempotency_key',gen_random_uuid()::text))).* FROM aios.job j WHERE job_id=$1",[lease.jobId]],
 ] as [string,unknown[]][]){try{await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[r.p.tenantId]);await assert.rejects(async()=>{await c.query(sql,args);await c.query('COMMIT');},/permission denied|immutable|http_bootstrap|descriptor|handler_not_installed/);}finally{await c.query('ROLLBACK');}}
 c.release();
});
test('Exact admitted bootstrap descriptor survives an actual PostgreSQL restart without granting completion',async t=>{
 const r=await scenario();t.after(()=>commands.cancel(r.p,r.site,r.id));const lease=await child(r),before=await worker.prepareHttpBootstrapExecution(lease);
 for(const pool of [runtime,scheduler,operator,supervisorPool,admin])await pool.end();
 execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',process.env.AIOS_TEST_DATA!,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart']);
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});
 const blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'http-bootstrap-blobs'),'local-synthetic-v1');ledger=new Ledger(runtime,blobs,'local-synthetic-v1');commands=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions,blobs);registry=new Registry(operator);lane=new HttpLane(scheduler,deletions);supervisor=new HttpSupervisor(supervisorPool);
 assert.deepEqual(await worker.prepareHttpBootstrapExecution(lease),before);const row=(await admin.query('SELECT state,result_ref FROM aios.job WHERE job_id=$1',[lease.jobId])).rows[0];assert.equal(row.state,'leased');assert.equal(row.result_ref,null);
});
test('Bootstrap admission cannot use a scope receipt absent from its frozen parent bundle',async t=>{
 const r=await run(origin(),750,false);t.after(()=>commands.cancel(r.p,r.site,r.id));const parent=await r.parent(),before=await counts();
 await assert.rejects(worker.enqueueHttpBootstrapFixture(parent,httpDigest,randomUUID()),/bundle_membership_required/);assert.deepEqual(await counts(),before);
});
test('Bootstrap scope metadata or retained bytes changing after admission fence execution',async t=>{
 for(const changed of ['metadata','bytes'] as const){const r=await scenario();t.after(()=>commands.cancel(r.p,r.site,r.id));const lease=await child(r);await worker.prepareHttpBootstrapExecution(lease);
  if(changed==='metadata')await admin.query('UPDATE aios.site SET version=version+1 WHERE id=$1',[r.site]);
  else{const e=(await admin.query('SELECT artifact_key FROM aios.evidence WHERE id=$1',[r.scope.evidenceId])).rows[0];await writeFile(join(process.env.AIOS_TEST_ROOT!,'http-bootstrap-blobs',e.artifact_key.replaceAll('/','_')),'corrupted source');}
  await assert.rejects(worker.prepareHttpBootstrapExecution(lease),/scope_receipt_invalid|source_context_changed|artifact_integrity_failed/);
 }
});
test('Signed fixture release cannot broaden installed HTTP permission or change its fixed procedure',async()=>{
 for(const variant of ['calls','tool','procedure'] as const){
  const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID();await admin.query('INSERT INTO control.authority_key VALUES($1,$2,true)',[reviewer,keys.publicKey.export({type:'spki',format:'pem'})]);
  const m=JSON.parse(await readFile('spec/examples/skill-http-bootstrap-fixture.json','utf8'));m.last_verified=new Date().toISOString();m.freshness_deadline=new Date(Date.now()+3600000).toISOString();
  if(variant==='calls')m.tool_permissions[0].max_calls=2;if(variant==='tool')m.tool_permissions[0].version='2.0.0';if(variant==='procedure')m.procedure[0].tool_id='render.observe';
  const approval={author:randomUUID(),reviewer,manifest_digest:manifestHash(m),evaluation_digest:manifestHash({fixture:true}),approved_at:new Date().toISOString(),scope:'local-synthetic-v1' as const,dependencies:[]};
  await assert.rejects(registry.approve(m,approval,sign(null,Buffer.from(canonical(approval)),keys.privateKey).toString('base64')),/handler_not_installed|permission|schema_invalid/);
 }
});
test('A corrupted frozen bundle manifest cannot authorize a bootstrap child',async t=>{
 const r=await scenario();t.after(()=>commands.cancel(r.p,r.site,r.id));const before=(await admin.query('SELECT count(*) FROM aios.job')).rows[0].count,c=await admin.connect();
 try{await c.query('BEGIN');await c.query("SET LOCAL session_replication_role='replica'");await c.query('UPDATE aios.evidence_bundle SET manifest_hash=$2 WHERE id=$1',[r.bundle,'a'.repeat(64)]);await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}
 await assert.rejects(worker.enqueueHttpBootstrapFixture(r.parent,httpDigest,randomUUID()),/artifact_integrity_failed/);assert.equal((await admin.query('SELECT count(*) FROM aios.job')).rows[0].count,before);
});
test('Scope artifact reads hold no work lock and cancellation during I/O blocks admission',async t=>{
 const r=await scenario();t.after(()=>commands.cancel(r.p,r.site,r.id));const blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'http-bootstrap-blobs'),'local-synthetic-v1');let checked=false;
 const guarded=new Jobs(scheduler,deletions,{read:async(...args)=>{
  const bytes=await blobs.read(...args),c=await admin.connect();try{await c.query('BEGIN');assert.equal((await c.query('SELECT pg_try_advisory_xact_lock(68273433) AS acquired')).rows[0].acquired,true);await c.query('ROLLBACK');}finally{c.release();}
  checked=true;await commands.cancel(r.p,r.site,r.id);return bytes;
 }});
 const count=(await admin.query('SELECT count(*) FROM aios.job')).rows[0].count;await assert.rejects(guarded.enqueueHttpBootstrapFixture(r.parent,httpDigest,randomUUID()),/run_fenced|lease_lost/);assert.equal(checked,true);assert.equal((await admin.query('SELECT count(*) FROM aios.job')).rows[0].count,count);
});
