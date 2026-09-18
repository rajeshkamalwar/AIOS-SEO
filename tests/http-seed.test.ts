import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID,generateKeyPairSync,sign } from 'node:crypto';
import { readFile,writeFile,mkdtemp,rm,unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync,spawnSync } from 'node:child_process';
import { createServer,type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import {transaction,scope,tick} from '../packages/persistence/transaction.js';
import { migrate } from '../packages/persistence/migrate.js';
import { Ledger,type Principal } from '../packages/persistence/index.js';
import { LocalBlobs } from '../packages/evidence/index.js';
import { Registry } from '../packages/skills/index.js';
import { Jobs,type Lease } from '../packages/jobs/index.js';
import { HttpLane } from '../packages/jobs/http-lane.js';
import { HttpSupervisor } from '../packages/jobs/http-supervisor.js';
import { IsolatedHttpSeedFixtureSupervisor } from '../packages/jobs/isolated-http-seed-fixture-supervisor.js';
import { IsolatedHttpFixtureSupervisor } from '../packages/jobs/isolated-http-fixture-supervisor.js';
import { DockerHttpFixtureEngine,type HttpFixtureEngine } from '../packages/jobs/docker-http-fixture.js';
import { DeletionLedger } from '../packages/policy/deletion.js';
import { canonical,manifestHash,hash,base,validate } from '../packages/contracts/index.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_http_seed_dispatch_test'};
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool,supervisorPool:pg.Pool,acceptorPool:pg.Pool;
let blobs:LocalBlobs;
let ledger:Ledger,commands:Jobs,worker:Jobs,registry:Registry,deletions:DeletionLedger,lane:HttpLane,supervisor:HttpSupervisor,digest:string,httpDigest:string;
async function fixture(type:string,changes:Record<string,unknown>){
 const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes};
 const table=({Tenant:'tenant',User:'app_user',Membership:'membership'} as Record<string,string>)[type];
 const entries=Object.entries(row).filter(([k])=>!['provenance_ids','site_scope_ids'].includes(k));
 await admin.query(`INSERT INTO aios.${table} (${entries.map(([k])=>k).join(',')}) VALUES(${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));
}
async function run(origin:string,requests=750,path='/services'){
 const p:Principal={tenantId:randomUUID(),userId:randomUUID()};
 await fixture('Tenant',{id:p.tenantId});await fixture('User',{id:p.userId,subject:p.userId});await fixture('Membership',{id:randomUUID(),tenant_id:p.tenantId,user_id:p.userId});
 for(const kind of ['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'])await admin.query('INSERT INTO control.tenant_cap VALUES($1,$2,10000)',[p.tenantId,kind]);
 const fixtureOrigin='https://'+new URL(origin).hostname.replace(/\.$/,'');
 const site=await ledger.registerSite(p,fixtureOrigin+path);
 const evidence=await ledger.accept(p,site,{attemptId:randomUUID(),sourceUri:fixtureOrigin+'/',capturedAt:new Date(Date.now()-1000).toISOString(),mimeType:'text/html',contextHash:manifestHash({fixture:true})},Buffer.from('fixture'));
 // Fixture profile admission intentionally excludes HTTP/trailing-dot spelling; seed
 // canonical url-v1 Site variants with test-owner authority to exercise accounting only.
 if(fixtureOrigin!==origin)await admin.query('UPDATE aios.site SET submitted_url=$2,normalized_origin=$3,origins=$4 WHERE id=$1',[site,origin+'/',origin,[origin]]);
 const id=await commands.submit(p,site,randomUUID(),{http_requests:requests,render_requests:0,render_pages:0,model_calls:0,tokens:0,cost_microusd:0,deadline:new Date(Date.now()+600000).toISOString()});
 const scope=await ledger.acceptSiteScopeFixture(p,site,id,deletions);
 const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[evidence.evidenceId,scope.evidenceId],[evidence.observationId,scope.observationId]);
 const parent=async()=>{await commands.enqueue(p,site,id,bundle,digest,randomUUID(),'project');const l=await worker.claim();assert.ok(l);return l;};
 const next=async()=>{const l=await parent(),child=await worker.enqueueHttpBootstrapFixture(l,httpDigest,randomUUID()),fetch=await worker.claim();assert.ok(fetch);assert.equal(fetch.jobId,child);return fetch;};
 return {p,site,id,next,parent,scope};
}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_http_seed_dispatch_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator','aios_http_supervisor','aios_http_acceptor'])await admin.query(`ALTER ROLE ${role} LOGIN`);
 runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});supervisor=new HttpSupervisor(supervisorPool);
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'http-seed-dispatch-blobs'),'local-synthetic-v1');ledger=new Ledger(runtime,blobs,'local-synthetic-v1');
 deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'http-seed-dispatch-deletions'));
 acceptorPool=new pg.Pool({...cfg,user:'aios_http_acceptor'});
 commands=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions,blobs,undefined,acceptorPool);registry=new Registry(operator);lane=new HttpLane(scheduler,deletions);
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
after(async()=>{for(const pool of [runtime,scheduler,operator,supervisorPool,acceptorPool,admin])await pool?.end();});
async function localFixture(handler:RequestListener){
 const server=createServer(handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {port:(server.address() as AddressInfo).port,close:async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
/** Trusted engine double proves broker/accounting behavior, never actual container isolation. */
function fakeEngine(options:{beforeStart?:()=>Promise<void>;beforeRequest?:()=>Promise<void>;repeat?:boolean;forge?:boolean;cleanupFails?:boolean}={}):HttpFixtureEngine{
 return {
  async create(){return {id:hash(Buffer.from(randomUUID())),imageDigest:'a'.repeat(64)};},
  async start(_container,control){
   await options.beforeStart?.();await control.beforeStart();await options.beforeRequest?.();
   const metadata=await control.onRequest(control.signal??new AbortController().signal);
   if(options.repeat)await assert.rejects(control.onRequest(control.signal??new AbortController().signal),/request|protocol|already|budget|invocation/);
   const value=options.forge?{...metadata,retainedBodySha256:'b'.repeat(64)}:metadata;
   return {stdout:Buffer.from(JSON.stringify({kind:'fetch'})+'\n'+JSON.stringify({kind:'result',metadata:value})+'\n'),state:'exited'};
  },
  async cleanup(){if(options.cleanupFails)throw new Error('container_state_uncertain');return {finishedAt:new Date().toISOString(),termination:'exited',exitCode:0};}
 };
}
type AcceptanceInput=Parameters<Jobs['acceptHttpBootstrapFixture']>[1];
const reviewedBody=Buffer.from('User-agent: *\nDisallow: /private\n');
async function httpRelease(){
 const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID();await admin.query('INSERT INTO control.authority_key VALUES($1,$2,true)',[reviewer,keys.publicKey.export({type:'spki',format:'pem'})]);
 const m=JSON.parse(await readFile('spec/examples/skill-http-bootstrap-fixture.json','utf8'));m.skill_id='seo.http-bootstrap-'+randomUUID().replace(/[0-9]/g,n=>String.fromCharCode(103+Number(n)));m.last_verified=new Date().toISOString();m.freshness_deadline=new Date(Date.now()+3600000).toISOString();
 const approval={author:randomUUID(),reviewer,manifest_digest:manifestHash(m),evaluation_digest:manifestHash({fixture:true}),approved_at:new Date().toISOString(),scope:'local-synthetic-v1' as const,dependencies:[]};
 return registry.approve(m,approval,sign(null,Buffer.from(canonical(approval)),keys.privateKey).toString('base64'));
}
async function scenario(){const origin=`https://${randomUUID()}.example`,r=await run(origin),parent=await r.parent(),release=await httpRelease(),id=await worker.enqueueHttpBootstrapFixture(parent,release,randomUUID()),lease=await worker.claim();assert.ok(lease);assert.equal(lease.jobId,id);return {...r,origin,release,lease};}
async function executed(handler:RequestListener=(_req,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.end(reviewedBody);}){
 const f=await scenario(),server=await localFixture(handler);let input:AcceptanceInput|undefined;
 const captureWorker=new Jobs(scheduler,deletions,blobs,undefined,acceptorPool);
 // Trusted test interception of the private handoff; no fabricated acceptance result.
 captureWorker.acceptHttpBootstrapFixture=async(_lease,value)=>{input=structuredClone(value);throw new Error('captured_private_handoff');};
 try{await assert.rejects(new IsolatedHttpFixtureSupervisor(captureWorker,lane,supervisor,fakeEngine()).collectAndAccept(f.lease,{fixturePort:server.port}),/captured_private_handoff/);}finally{await server.close();}
 assert.ok(input);return {...f,input};
}
async function accepted(handler?:RequestListener){const f=await executed(handler);return {...f,acceptance:await worker.acceptHttpBootstrapFixture(f.lease,f.input)};}
async function counts(){return (await admin.query('SELECT (SELECT count(*) FROM aios.evidence) evidence,(SELECT count(*) FROM aios.observation) observations,(SELECT count(*) FROM aios.outbox) events,(SELECT count(*) FROM aios.page_snapshot) pages,(SELECT count(*) FROM aios.render_snapshot) renders')).rows[0];}
async function noWrites(call:()=>Promise<unknown>,error:RegExp){const before=await counts(),put=blobs.put;let uploads=0;blobs.put=async function(key,data){uploads++;return put.call(this,key,data);};try{await assert.rejects(call(),error);assert.equal(uploads,0);assert.deepEqual(await counts(),before);}finally{blobs.put=put;}}
async function completed(handler?:RequestListener){const f=await accepted(handler),robots=await worker.projectHttpBootstrapFixture(f.lease);return {...f,robots};}
async function target(f:Awaited<ReturnType<typeof completed>>){return (await admin.query("SELECT * FROM aios.crawl_target WHERE crawl_id=$1 AND seed_kind='submitted'",[f.id])).rows[0];}
async function state(f:Awaited<ReturnType<typeof completed>>){return {counts:await counts(),clock:(await admin.query('SELECT seq FROM aios.knowledge_clock WHERE tenant_id=$1',[f.p.tenantId])).rows[0].seq,bundles:(await admin.query('SELECT count(*) FROM aios.evidence_bundle')).rows[0].count,jobs:(await admin.query('SELECT count(*) FROM aios.job')).rows[0].count,target:await target(f)};}
async function rejectSource(f:Awaited<ReturnType<typeof accepted>>,target=f.scope.evidenceId){
 await admin.query('ALTER ROLE aios_evaluator LOGIN');const evaluator=new pg.Pool({...cfg,user:'aios_evaluator'});
 try{await transaction(evaluator,'aios_evaluator',async c=>{await scope(c,f.p,f.site);const time=await tick(c,f.p.tenantId),id=randomUUID();const row={record_type:'SelfAuditResult',id,schema_version:2,version:1,created_at:time.recorded_at,recorded_at:time.recorded_at,updated_at:time.recorded_at,deleted_at:null,state:'recorded',retention_class:'audit',tenant_id:f.p.tenantId,site_id:f.site,crawl_id:f.id,check_id:'A02',check_version:'1.1.0',result:'fail',effect:'reject_outputs',reason:'independent fixture rejection',knowledge_seq:time.knowledge_seq,scope:'outputs',scope_complete:true,dependency_snapshot_hash:'0'.repeat(64),recovery_of_id:null};const fields=Object.entries(row);await c.query(`INSERT INTO self_audit_result (${fields.map(([k])=>k).join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(([,v])=>v));await c.query('INSERT INTO audit_impact VALUES($1,$2,$3,$4,true)',[f.p.tenantId,f.site,id,target]);});}finally{await evaluator.end();}
}
async function seedRelease(){
 const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID();await admin.query('INSERT INTO control.authority_key VALUES($1,$2,true)',[reviewer,keys.publicKey.export({type:'spki',format:'pem'})]);
 const m=JSON.parse(await readFile('spec/examples/skill-http-seed-fixture.json','utf8'));m.skill_id='seo.http-seed-'+randomUUID().replace(/[0-9]/g,n=>String.fromCharCode(103+Number(n)));m.last_verified=new Date().toISOString();m.freshness_deadline=new Date(Date.now()+3600000).toISOString();
 const approval={author:randomUUID(),reviewer,manifest_digest:manifestHash(m),evaluation_digest:manifestHash({fixture:true}),approved_at:new Date().toISOString(),scope:'local-synthetic-v1' as const,dependencies:[]};
 return registry.approve(m,approval,sign(null,Buffer.from(canonical(approval)),keys.privateKey).toString('base64'));
}
async function admitted(handler?:RequestListener){const f=await completed(handler),admission=await worker.admitHttpBootstrapSeed(f.lease),seedDigest=await seedRelease();return {...f,admission,seedDigest};}
async function waitOrigin(origin:string){const row=(await admin.query("SELECT greatest(0,ceil(extract(epoch FROM(last_started_at+interval '1 second'-clock_timestamp()))*1000)) AS ms FROM control.http_origin WHERE origin=$1",[origin])).rows[0];if(row&&Number(row.ms)>0)await new Promise(resolve=>setTimeout(resolve,Number(row.ms)+10));}
async function seedChild(f:Awaited<ReturnType<typeof admitted>>,key=randomUUID()){const id=await worker.enqueueHttpSeedFixture(f.lease,f.seedDigest,key),lease=await worker.claim();assert.ok(lease);assert.equal(lease.jobId,id);await waitOrigin(f.origin);return lease;}
async function historical(sql:string,args:unknown[]){const c=await admin.connect();try{await c.query('BEGIN');await c.query("SET LOCAL session_replication_role='replica'");await c.query(sql,args);await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}}
test('Seed child binds only the admitted submitted target and its post-robots frozen context',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const key=randomUUID(),before=await counts();const id=await worker.enqueueHttpSeedFixture(f.lease,f.seedDigest,key);assert.equal(await worker.enqueueHttpSeedFixture(f.lease,f.seedDigest,key),id);
 const lease=await worker.claim();assert.ok(lease);assert.equal(lease.jobId,id);const d=await worker.prepareHttpSeedExecution(lease);
 assert.equal(d.url,f.origin+'/services');assert.equal(d.origin,f.origin);assert.equal(d.method,'GET');assert.equal(d.maxDecodedBytes,5242880);assert.equal(d.timeoutMs,20000);assert.equal(d.targetId,f.admission.targetId);assert.equal(d.bundleId,f.admission.bundleId);assert.equal(d.robotsObservationId,f.acceptance.observationId);
 await worker.assertHttpSeedExecution(lease,d);assert.deepEqual({...await counts(),events:before.events},before);assert.equal(Number((await counts()).events),Number(before.events)+1);assert.equal((await admin.query("SELECT count(*) FROM aios.outbox WHERE payload->'payload'->>'job_id'=$1 AND event_type='crawl.started'",[lease.jobId])).rows[0].count,'1');await assert.rejects(worker.complete(lease,randomUUID()),/handler_not_installed/);
});
test('Excluded or unknown robots classifications never create a seed fetch child',async t=>{
 for(const variant of ['disallow','denied','unknown'] as const){const f=await admitted((_q,r)=>{r.writeHead(variant==='denied'?403:variant==='unknown'?503:200,{'content-type':'text/plain'});r.end(variant==='disallow'?'User-agent: *\nDisallow: /\n':reviewedBody);});t.after(()=>commands.cancel(f.p,f.site,f.id));assert.equal(f.admission.admitted,false);const before=await state(f);await assert.rejects(worker.enqueueHttpSeedFixture(f.lease,f.seedDigest,randomUUID()),/seed|target|robots|admission/);assert.deepEqual(await state(f),before);}
});
test('Seed dispatch requires original completed bootstrap proof, admission and exact installed release',async t=>{
 const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));const release=await seedRelease();await assert.rejects(worker.enqueueHttpSeedFixture(f.lease,release,randomUUID()),/seed|admission|target/);await worker.admitHttpBootstrapSeed(f.lease);
 for(const proof of [{...f.lease,token:randomUUID()},{...f.lease,attemptId:randomUUID()},{...f.lease,tenantId:randomUUID()},{...f.lease,siteId:randomUUID()}])await assert.rejects(worker.enqueueHttpSeedFixture(proof,release,randomUUID()),/lease_lost|scope_denied|run_fenced|invalid_receipt/);
 for(const wrong of [digest,f.release])await assert.rejects(worker.enqueueHttpSeedFixture(f.lease,wrong,randomUUID()),/handler_not_installed|permission|authority/);
});
test('Concurrent seed dispatch creates one immutable child per target and rejects changed idempotency input',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const key=randomUUID(),before=Number((await state(f)).jobs);const [a,b]=await Promise.all([worker.enqueueHttpSeedFixture(f.lease,f.seedDigest,key),worker.enqueueHttpSeedFixture(f.lease,f.seedDigest,key)]);assert.equal(a,b);assert.equal(Number((await state(f)).jobs),before+1);
 try{assert.equal(await worker.enqueueHttpSeedFixture(f.lease,f.seedDigest,randomUUID()),a);}catch(error){assert.match(String(error),/conflict|target_claimed|already/);}assert.equal(Number((await state(f)).jobs),before+1);
 const otherRelease=await seedRelease();await assert.rejects(worker.enqueueHttpSeedFixture(f.lease,otherRelease,key),/conflict|source_context_changed/);
});
test('Changed target identity, seed bundle manifest and robots source bytes fence dispatch',async t=>{
 for(const change of ['target','bundle','robots','scope'] as const){const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const beforeJobs=(await state(f)).jobs;
  if(change==='target')await admin.query("UPDATE aios.crawl_target SET url=url||'changed',url_key=url_key||'changed' WHERE id=$1",[f.admission.targetId]);
  if(change==='bundle')await historical('UPDATE aios.evidence_bundle SET manifest_hash=$2 WHERE id=$1',[f.admission.bundleId,'a'.repeat(64)]);
  if(change==='robots'||change==='scope'){const id=change==='robots'?f.acceptance.bodyEvidenceId:f.scope.evidenceId,e=(await admin.query('SELECT artifact_key FROM aios.evidence WHERE id=$1',[id])).rows[0];await writeFile(join(process.env.AIOS_TEST_ROOT!,'http-seed-dispatch-blobs',e.artifact_key.replaceAll('/','_')),'corrupted source');}
  await assert.rejects(worker.enqueueHttpSeedFixture(f.lease,f.seedDigest,randomUUID()),/source_context_changed|artifact_integrity_failed|target|seed|scope_receipt_invalid/);assert.equal((await state(f)).jobs,beforeJobs);
 }
});
test('Current membership, source and child releases, audit, deletion and freshness gate prepared seed execution',async t=>{
 for(const fence of ['membership','source-release','child-release','audit','deletion','freshness','cancel'] as const){const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const lease=await seedChild(f);await worker.prepareHttpSeedExecution(lease);
  if(fence==='membership')await admin.query("UPDATE aios.membership SET state='revoked' WHERE tenant_id=$1",[f.p.tenantId]);
  if(fence==='source-release')await registry.change(f.release,'revoked','fixture');if(fence==='child-release')await registry.change(f.seedDigest,'revoked','fixture');if(fence==='audit')await rejectSource(f,f.acceptance.bodyEvidenceId!);if(fence==='deletion')await deletions.record(f.p.tenantId,f.site);if(fence==='cancel')await commands.cancel(f.p,f.site,f.id);
  if(fence==='freshness')await historical("UPDATE aios.observation SET observed_at=clock_timestamp()-interval '2 seconds',fresh_until=clock_timestamp()-interval '1 second' WHERE id=$1",[f.acceptance.observationId]);
  await assert.rejects(worker.prepareHttpSeedExecution(lease),/scope_denied|deleted_scope|run_fenced|lease_lost|revoked|release|audit|input_|source_|fresh|robots/);
  if(fence==='membership')await admin.query("UPDATE aios.membership SET state='active' WHERE tenant_id=$1",[f.p.tenantId]);
 }
});
test('Source reads stay outside locks and changed authority during I/O prevents seed job creation',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));let checked=false;const guarded=new Jobs(scheduler,deletions,{read:async(...args)=>{const bytes=await blobs.read(...args),c=await admin.connect();try{await c.query('BEGIN');assert.equal((await c.query('SELECT pg_try_advisory_xact_lock(68273433) acquired')).rows[0].acquired,true);await c.query('ROLLBACK');}finally{c.release();}if(!checked){checked=true;await commands.cancel(f.p,f.site,f.id);}return bytes;}});const before=(await state(f)).jobs;await assert.rejects(guarded.enqueueHttpSeedFixture(f.lease,f.seedDigest,randomUUID()),/run_fenced|lease_lost/);assert.equal(checked,true);assert.equal((await state(f)).jobs,before);
});
test('Seed reservation cap remains spent across retry attempts and descriptor mutation cannot broaden it',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const lease=await seedChild(f),d=await worker.prepareHttpSeedExecution(lease);
 await assert.rejects(worker.assertHttpSeedExecution(lease,{...d,url:d.origin+'/other'}),/source_context_changed|conflict|descriptor/);
 await assert.rejects(lane.reserve(lease,{origin:d.origin,maxDecodedBytes:d.maxDecodedBytes+1}),/source_context_changed|scope_denied|invalid_input/);
 const r=await lane.reserve(lease,{origin:d.origin,maxDecodedBytes:d.maxDecodedBytes});assert.deepEqual(await lane.reserve(lease,{origin:d.origin,maxDecodedBytes:d.maxDecodedBytes}),r);await worker.fail(lease,'timeout',true);await admin.query('UPDATE aios.job SET available_at=clock_timestamp() WHERE job_id=$1',[lease.jobId]);const retry=await worker.claim();assert.equal(retry,null);await assert.rejects(lane.reserve(lease,{origin:d.origin,maxDecodedBytes:d.maxDecodedBytes}),/lease_lost|target_claimed/);assert.equal((await admin.query('SELECT count(*) FROM aios.http_reservation WHERE job_id=$1',[lease.jobId])).rows[0].count,'1');assert.equal((await admin.query("SELECT count(*) FROM aios.budget_reservation WHERE job_id=$1 AND kind='http_requests'",[lease.jobId])).rows[0].count,'1');assert.equal(Number((await target(f)).attempts),1);
});
test('Service roles cannot mutate the seed descriptor or clone an ungoverned fetch job',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const lease=await seedChild(f);
 for(const pool of [runtime,scheduler,supervisorPool,acceptorPool]){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.p.tenantId]);await assert.rejects(c.query('UPDATE aios.http_seed_job SET descriptor=$2 WHERE job_id=$1',[lease.jobId,{}]),/permission denied|immutable/);}finally{await c.query('ROLLBACK');c.release();}}
 await assert.rejects(transaction(scheduler,'aios_scheduler',async c=>{await scope(c,f.p,f.site);await c.query("INSERT INTO aios.job SELECT (jsonb_populate_record(NULL::aios.job,to_jsonb(j)||jsonb_build_object('job_id',gen_random_uuid(),'idempotency_key',gen_random_uuid()::text))).* FROM aios.job j WHERE job_id=$1",[lease.jobId]);}),/descriptor|seed|bootstrap|handler|permission denied/);
});
test('Bootstrap acceptance and projection cannot accept the dedicated seed handler',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const lease=await seedChild(f),before=await counts();await assert.rejects(worker.acceptHttpBootstrapFixture(lease,f.input),/handler_not_installed|invalid_receipt|source_context_changed/);await assert.rejects(worker.projectHttpBootstrapFixture(lease),/handler_not_installed|snapshot_unavailable|acceptance_required|source_unavailable/);assert.deepEqual(await counts(),before);
});
test('A generic project or bootstrap lease cannot create a seed container',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));let created=0;const engine:HttpFixtureEngine={async create(){created++;throw new Error('must_not_create');},async start(){throw new Error('must_not_start');},async cleanup(){throw new Error('must_not_cleanup');}};const producer=new IsolatedHttpSeedFixtureSupervisor(worker,lane,supervisor,engine);await assert.rejects(producer.collect(f.lease,{fixturePort:12345}),/handler_not_installed|lease_lost/);assert.equal(created,0);
});
test('Isolated seed broker dispatches exact admitted path once and cannot follow redirects or accept evidence',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const lease=await seedChild(f),paths:string[]=[],server=await localFixture((q,r)=>{paths.push(q.url!);r.writeHead(302,{location:'http://127.0.0.1:1/private'});r.end();});t.after(server.close);const before=await counts();const result=await new IsolatedHttpSeedFixtureSupervisor(worker,lane,supervisor,fakeEngine()).collect(lease,{fixturePort:server.port});validate(base+'http-seed-execution.schema.json',result);assert.equal(result.evidenceAccepted,false);assert.equal(result.result?.status,302);assert.deepEqual(paths,['/services']);assert.deepEqual({...await counts(),events:before.events},before);assert.equal(Number((await counts()).events),Number(before.events)+1);const job=(await admin.query('SELECT state,result_ref FROM aios.job WHERE job_id=$1',[lease.jobId])).rows[0];assert.equal(job.state,'leased');assert.equal(job.result_ref,null);const seed=await target(f);assert.equal(seed.state,'fetching');assert.equal(Number(seed.attempts),1);await assert.rejects(new IsolatedHttpSeedFixtureSupervisor(worker,lane,supervisor,fakeEngine()).collect(lease,{fixturePort:server.port}),/already|settled|invocation|budget|source_context_changed/);assert.deepEqual(paths,['/services']);
});
test('Current changes between preparation and socket dispatch forbid a seed request',async t=>{
 for(const stage of ['beforeStart','beforeRequest'] as const){const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const lease=await seedChild(f);let hits=0;const server=await localFixture((_q,r)=>{hits++;r.end('fixture');});t.after(server.close);const engine=fakeEngine({[stage]:async()=>{await registry.change(f.seedDigest,'revoked','fixture');}});try{await new IsolatedHttpSeedFixtureSupervisor(worker,lane,supervisor,engine).collect(lease,{fixturePort:server.port});}catch(error){assert.match(String(error),/revoked|release|termination|uncertain|lease|source/);}assert.equal(hits,0);}
});
test('Uncertain container cleanup preserves the consumed seed claim and reservation',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const lease=await seedChild(f),server=await localFixture((_q,r)=>r.end('fixture'));t.after(server.close);await assert.rejects(new IsolatedHttpSeedFixtureSupervisor(worker,lane,supervisor,fakeEngine({cleanupFails:true})).collect(lease,{fixturePort:server.port}),/uncertain|termination/);const row=(await admin.query('SELECT settled_at,actual_bytes FROM aios.http_reservation WHERE job_id=$1',[lease.jobId])).rows[0];assert.equal(row.settled_at,null);assert.equal(row.actual_bytes,null);assert.equal((await target(f)).state,'fetching');assert.equal((await admin.query('SELECT count(*) FROM aios.http_terminal_receipt t JOIN aios.http_reservation r USING(tenant_id,reservation_id) WHERE r.job_id=$1',[lease.jobId])).rows[0].count,'0');
});
if(process.env.AIOS_TEST_HTTP_SEED_DISPATCH==='1')test('Actual isolated robots bootstrap then seed dispatch uses only the admitted local path',async t=>{
 const f=await scenario();t.after(()=>commands.cancel(f.p,f.site,f.id));const paths:string[]=[],server=await localFixture((q,r)=>{paths.push(q.url!);r.writeHead(q.url==='/robots.txt'?200:302,{'content-type':'text/plain',...(q.url==='/robots.txt'?{}:{location:'http://127.0.0.1:1/no-follow'})});r.end(q.url==='/robots.txt'?reviewedBody:'fixture');});t.after(server.close);const prefix=process.env.AIOS_DOCKER_CONTEXT?['--context',process.env.AIOS_DOCKER_CONTEXT]:[],imageDigest=execFileSync('docker',[...prefix,'image','inspect','aios-seo-http-fixture','--format','{{.Id}}'],{encoding:'utf8'}).trim().replace(/^sha256:/,'');const engine=new DockerHttpFixtureEngine({imageDigest,...(process.env.AIOS_DOCKER_CONTEXT?{dockerContext:process.env.AIOS_DOCKER_CONTEXT}:{})});await new IsolatedHttpFixtureSupervisor(worker,lane,supervisor,engine).collectAcceptAndProject(f.lease,{fixturePort:server.port});await worker.admitHttpBootstrapSeed(f.lease);const release=await seedRelease(),id=await worker.enqueueHttpSeedFixture(f.lease,release,randomUUID()),lease=await worker.claim();assert.ok(lease);assert.equal(lease.jobId,id);await waitOrigin(f.origin);const before=await counts(),result=await new IsolatedHttpSeedFixtureSupervisor(worker,lane,supervisor,engine).collect(lease,{fixturePort:server.port});assert.equal(result.state,'completed');assert.equal(result.result?.status,302);assert.equal(result.evidenceAccepted,false);assert.deepEqual(paths,['/robots.txt','/services']);assert.deepEqual({...await counts(),events:before.events},before);assert.equal(Number((await counts()).events),Number(before.events)+1);assert.equal((await admin.query('SELECT state FROM aios.crawl WHERE id=$1',[f.id])).rows[0].state,'running');
});
test('Seed claim event failure rolls back target, reservation and permanent charges atomically',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const lease=await seedChild(f),d=await worker.prepareHttpSeedExecution(lease),before=await state(f),reservations=(await admin.query('SELECT count(*) FROM aios.http_reservation')).rows[0].count,budget=(await admin.query('SELECT * FROM aios.budget_reservation WHERE crawl_id=$1',[f.id])).rows;
 await admin.query("CREATE FUNCTION aios.test_seed_claim_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'seed_claim_outbox_failure'; END $$; CREATE TRIGGER test_seed_claim_fail BEFORE INSERT ON aios.outbox FOR EACH ROW WHEN (NEW.event_type='frontier.seed_fetch_claimed') EXECUTE FUNCTION aios.test_seed_claim_fail()");
 try{await assert.rejects(lane.reserve(lease,{origin:d.origin,maxDecodedBytes:d.maxDecodedBytes}),/seed_claim_outbox_failure/);}finally{await admin.query('DROP TRIGGER test_seed_claim_fail ON aios.outbox; DROP FUNCTION aios.test_seed_claim_fail()');}
 assert.deepEqual(await state(f),before);assert.equal((await admin.query('SELECT count(*) FROM aios.http_reservation')).rows[0].count,reservations);assert.deepEqual((await admin.query('SELECT * FROM aios.budget_reservation WHERE crawl_id=$1',[f.id])).rows,budget);await lane.reserve(lease,{origin:d.origin,maxDecodedBytes:d.maxDecodedBytes});assert.equal((await target(f)).state,'fetching');
});
test('Direct accounting SQL cannot reserve a changed or already consumed submitted target',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const lease=await seedChild(f),d=await worker.prepareHttpSeedExecution(lease);
 const reserve=async(l:Lease)=>transaction(scheduler,'aios_scheduler',async c=>{await scope(c,f.p,f.site);const id=randomUUID();return c.query('SELECT * FROM control.reserve_http_accounting($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,d.origin,d.maxDecodedBytes,id,manifestHash({id,actual:1})]);});
 await admin.query("UPDATE aios.crawl_target SET state='excluded',admitted=false,reason='robots_disallowed' WHERE id=$1",[f.admission.targetId]);await assert.rejects(reserve(lease),/target|seed|source_context_changed|scope_denied/);assert.equal((await admin.query('SELECT count(*) FROM aios.http_reservation WHERE job_id=$1',[lease.jobId])).rows[0].count,'0');
});
test('Seed source descriptor persists across PostgreSQL restart and refuses newly restricted inputs',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const lease=await seedChild(f),expected=await worker.prepareHttpSeedExecution(lease);
 for(const pool of [runtime,scheduler,operator,supervisorPool,acceptorPool,admin])await pool.end();execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',process.env.AIOS_TEST_DATA!,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart']);
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});acceptorPool=new pg.Pool({...cfg,user:'aios_http_acceptor'});ledger=new Ledger(runtime,blobs,'local-synthetic-v1');commands=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions,blobs,undefined,acceptorPool);registry=new Registry(operator);lane=new HttpLane(scheduler,deletions);supervisor=new HttpSupervisor(supervisorPool);
 assert.deepEqual(await worker.prepareHttpSeedExecution(lease),expected);await rejectSource(f,f.admission.bundleId);await assert.rejects(worker.prepareHttpSeedExecution(lease),/input_|audit|restricted/);
});
test('Caller fields cannot change seed URL, HTTP method or response budget',async t=>{
 const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const lease=await seedChild(f);let created=0;const engine=fakeEngine(),create=engine.create;engine.create=async()=>{created++;return create();};const producer=new IsolatedHttpSeedFixtureSupervisor(worker,lane,supervisor,engine);
 for(const extra of [{url:f.origin+'/other'},{maxDecodedBytes:1},{method:'POST'}])await assert.rejects(producer.collect(lease,{fixturePort:12345,...extra} as {fixturePort:number}),/invalid_input/);assert.equal(created,0);
});
test('Historical robots projection substitution cannot authorize seed enqueue or prepared dispatch',async t=>{
 for(const field of ['contextHash','observationId','state'] as const){const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const lease=await seedChild(f);await worker.prepareHttpSeedExecution(lease);const value=field==='contextHash'?'a'.repeat(64):field==='observationId'?randomUUID():'unknown';await historical("UPDATE aios.http_bootstrap_projection SET result=jsonb_set(result,$2::text[],$3::jsonb) WHERE job_id=$1",[f.lease.jobId,[field],JSON.stringify(value)]);await assert.rejects(worker.enqueueHttpSeedFixture(f.lease,f.seedDigest,randomUUID()),/artifact_integrity_failed|source_context_changed|seed|invalid_receipt|scope_denied/);await assert.rejects(worker.prepareHttpSeedExecution(lease),/artifact_integrity_failed|source_context_changed|seed|invalid_receipt|scope_denied/);}
});
test('Independently signed seed release cannot broaden its one installed GET capability',async()=>{
 for(const field of ['calls','tool','handler'] as const){const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID();await admin.query('INSERT INTO control.authority_key VALUES($1,$2,true)',[reviewer,keys.publicKey.export({type:'spki',format:'pem'})]);const m=JSON.parse(await readFile('spec/examples/skill-http-seed-fixture.json','utf8'));m.last_verified=new Date().toISOString();m.freshness_deadline=new Date(Date.now()+3600000).toISOString();if(field==='calls')m.tool_permissions[0].max_calls=2;if(field==='tool')m.tool_permissions[0].version='2.0.0';if(field==='handler')m.procedure[0].operation='http_bootstrap_fixture_v1';const approval={author:randomUUID(),reviewer,manifest_digest:manifestHash(m),evaluation_digest:manifestHash({fixture:true}),approved_at:new Date().toISOString(),scope:'local-synthetic-v1' as const,dependencies:[]};await assert.rejects(registry.approve(m,approval,sign(null,Buffer.from(canonical(approval)),keys.privateKey).toString('base64')),/handler_not_installed|permission|schema_invalid/);}
});
test('Queued seed children are not leased after source revocation, target change or source audit rejection',async t=>{
 for(const fence of ['release','target','audit'] as const){const f=await admitted();t.after(()=>commands.cancel(f.p,f.site,f.id));const id=await worker.enqueueHttpSeedFixture(f.lease,f.seedDigest,randomUUID());if(fence==='release')await registry.change(f.release,'revoked','fixture');if(fence==='target')await admin.query("UPDATE aios.crawl_target SET state='excluded',admitted=false,reason='robots_disallowed' WHERE id=$1",[f.admission.targetId]);if(fence==='audit'){
  await rejectSource(f,f.acceptance.bodyEvidenceId!);const independent=await run('https://'+randomUUID()+'.example');t.after(()=>commands.cancel(independent.p,independent.site,independent.id));const bundle=await ledger.freeze(independent.p,independent.site,await ledger.cutoff(independent.p,independent.site),[independent.scope.evidenceId],[independent.scope.observationId]),healthy=await commands.enqueue(independent.p,independent.site,independent.id,bundle,digest,randomUUID(),'project');
  // Deterministic scheduler-history fixture: visit the rejected candidate first.
  await admin.query('INSERT INTO control.scheduler_turn VALUES($1,9223372036854775806) ON CONFLICT(tenant_id) DO UPDATE SET last_dispatch=excluded.last_dispatch',[independent.p.tenantId]);const claimed=await worker.claim();assert.ok(claimed);assert.equal(claimed.jobId,healthy);assert.equal((await admin.query('SELECT state FROM aios.job WHERE job_id=$1',[id])).rows[0].state,'failed');
 }else assert.equal(await worker.claim(),null);assert.equal((await admin.query('SELECT count(*) FROM aios.job_attempt WHERE job_id=$1',[id])).rows[0].count,'0');assert.equal((await admin.query('SELECT count(*) FROM aios.http_reservation WHERE job_id=$1',[id])).rows[0].count,'0');}
});
