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
import {FixtureFrontier} from '../packages/jobs/frontier.js';
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
import { canonical,manifestHash,hash,base,validate } from '../packages/contracts/index.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_http_seed_test'};
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool,supervisorPool:pg.Pool,acceptorPool:pg.Pool;
let blobs:LocalBlobs;
let ledger:Ledger,commands:Jobs,worker:Jobs,registry:Registry,deletions:DeletionLedger,lane:HttpLane,supervisor:HttpSupervisor,digest:string,httpDigest:string;
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
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_http_seed_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator','aios_http_supervisor','aios_http_acceptor'])await admin.query(`ALTER ROLE ${role} LOGIN`);
 runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});supervisor=new HttpSupervisor(supervisorPool);
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'http-seed-blobs'),'local-synthetic-v1');ledger=new Ledger(runtime,blobs,'local-synthetic-v1');
 deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'http-seed-deletions'));
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
test('Completed robots proof classifies the actual submitted seed with an atomic fresh bundle and no collection',async t=>{
 const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await state(f),descriptor=(await admin.query('SELECT descriptor FROM aios.http_bootstrap_job WHERE job_id=$1',[f.lease.jobId])).rows[0].descriptor,original=(await admin.query('SELECT * FROM aios.evidence_bundle WHERE id=$1',[descriptor.bundleId])).rows[0];
 const r=await worker.admitHttpBootstrapSeed(f.lease);validate(base+'http-bootstrap-seed-admission.schema.json',r);assert.equal(r.invocationId,f.acceptance.invocationId);assert.equal(r.observationId,f.acceptance.observationId);assert.equal(r.targetId,before.target.id);assert.equal(r.state,'queued');assert.equal(r.admitted,true);assert.equal(r.reason,null);assert.notEqual(r.bundleId,descriptor.bundleId);
 const after=await state(f);assert.equal(after.target.url,f.origin+'/');assert.equal(after.target.admitted,true);assert.equal(after.target.state,'queued');assert.equal(Number(after.target.attempts),0);assert.equal(after.jobs,before.jobs);assert.equal(after.counts.evidence,before.counts.evidence);assert.equal(after.counts.observations,before.counts.observations);assert.equal(after.counts.pages,before.counts.pages);assert.equal(Number(after.bundles),Number(before.bundles)+1);assert.equal(Number(after.counts.events),Number(before.counts.events)+1);
 const bundle=await ledger.bundle(f.p,f.site,r.bundleId);assert.deepEqual(new Set(bundle.evidence_ids as string[]),new Set([f.scope.evidenceId,f.acceptance.bodyEvidenceId,f.acceptance.receiptEvidenceId]));assert.deepEqual(new Set(bundle.observation_ids as string[]),new Set([f.scope.observationId,f.acceptance.observationId]));assert.ok(Number(bundle.known_seq)>Number(original.known_seq));assert.deepEqual((await admin.query('SELECT * FROM aios.evidence_bundle WHERE id=$1',[descriptor.bundleId])).rows[0],original);
 const event=(await ledger.pending(f.p,f.site)).find(e=>e.event_type==='frontier.seed_classified'&&(e.payload as any).target_id===r.targetId);assert.ok(event);validate(base+'event.schema.json',event);assert.equal((event.payload as any).bundle_id,r.bundleId);assert.equal(Object.hasOwn(event.payload as object,'sitemap_observation_id'),false);assert.equal((await admin.query('SELECT state FROM aios.crawl WHERE id=$1',[f.id])).rows[0].state,'running');
 const checkpoint=await state(f);assert.deepEqual(await worker.admitHttpBootstrapSeed(f.lease),r);assert.deepEqual(await state(f),checkpoint);
});
test('Submitted seed disposition preserves robots disallow, denied and unknown independently of sitemaps',async t=>{
 for(const [code,body,expected,reason] of [[200,'User-agent: *\nDisallow: /\n','excluded','robots_disallowed'],[403,reviewedBody,'excluded','robots_denied'],[503,reviewedBody,'deferred','robots_unknown'],[404,reviewedBody,'queued',null]] as const){
  const f=await completed((_req,res)=>{res.writeHead(code,{'content-type':'text/plain'});res.end(body);});t.after(()=>commands.cancel(f.p,f.site,f.id));const r=await worker.admitHttpBootstrapSeed(f.lease);assert.equal(r.state,expected);assert.equal(r.reason,reason);assert.equal(r.admitted,expected==='queued');assert.equal(Number((await target(f)).attempts),0);
 } const failed=await completed(req=>req.socket.destroy());t.after(()=>commands.cancel(failed.p,failed.site,failed.id));const deferred=await worker.admitHttpBootstrapSeed(failed.lease);assert.equal(deferred.state,'deferred');assert.equal(deferred.reason,'robots_unknown');
});
test('Incomplete bootstrap or forged original proof cannot admit the submitted target',async t=>{
 const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));await assert.rejects(worker.admitHttpBootstrapSeed(f.lease),/projection_required|source_unavailable|lease_lost|completed|bootstrap_incomplete/);
 await worker.projectHttpBootstrapFixture(f.lease);
 for(const lease of [{...f.lease,token:randomUUID()},{...f.lease,attemptId:randomUUID()},{...f.lease,tenantId:randomUUID()},{...f.lease,siteId:randomUUID()}])await assert.rejects(worker.admitHttpBootstrapSeed(lease),/lease_lost|run_fenced|scope_denied|invalid_receipt/);
});
test('Seed admission never overwrites an existing frontier classification or a changed target identity',async t=>{
 for(const change of ['classified','url'] as const){const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));const seed=await target(f);
  if(change==='classified')await admin.query("UPDATE aios.crawl_target SET state='excluded',admitted=false,reason='robots_denied' WHERE id=$1",[seed.id]);else await admin.query("UPDATE aios.crawl_target SET url=url||'changed',url_key=url_key||'changed' WHERE id=$1",[seed.id]);
  const before=await state(f);await assert.rejects(worker.admitHttpBootstrapSeed(f.lease),/target_unavailable|source_context_changed|conflict|already|seed/);assert.deepEqual(await state(f),before);
 }
});
test('Concurrent seed admission creates one classification, one bundle and one event',async t=>{
 const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await state(f),[a,b]=await Promise.all([worker.admitHttpBootstrapSeed(f.lease),worker.admitHttpBootstrapSeed(f.lease)]);assert.deepEqual(a,b);const after=await state(f);assert.equal(Number(after.bundles),Number(before.bundles)+1);assert.equal(Number(after.counts.events),Number(before.counts.events)+1);const clock=after.clock;assert.deepEqual(await worker.admitHttpBootstrapSeed(f.lease),a);assert.equal((await state(f)).clock,clock);
});
test('Event failure rolls back target classification, fresh bundle, immutable receipt and clock together',async t=>{
 const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await state(f);await admin.query("CREATE FUNCTION aios.test_http_seed_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'http_seed_outbox_failure'; END $$; CREATE TRIGGER test_http_seed_fail BEFORE INSERT ON aios.outbox FOR EACH ROW WHEN (NEW.event_type='frontier.seed_classified') EXECUTE FUNCTION aios.test_http_seed_fail()");
 try{await assert.rejects(worker.admitHttpBootstrapSeed(f.lease),/http_seed_outbox_failure/);}finally{await admin.query('DROP TRIGGER test_http_seed_fail ON aios.outbox; DROP FUNCTION aios.test_http_seed_fail()');}assert.deepEqual(await state(f),before);assert.equal((await admin.query('SELECT * FROM aios.http_bootstrap_seed_admission WHERE job_id=$1',[f.lease.jobId])).rowCount,0);assert.equal((await worker.admitHttpBootstrapSeed(f.lease)).state,'queued');
});

async function rejectSource(f:Awaited<ReturnType<typeof accepted>>,target=f.scope.evidenceId){
 await admin.query('ALTER ROLE aios_evaluator LOGIN');const evaluator=new pg.Pool({...cfg,user:'aios_evaluator'});
 try{await transaction(evaluator,'aios_evaluator',async c=>{await scope(c,f.p,f.site);const time=await tick(c,f.p.tenantId),id=randomUUID();const row={record_type:'SelfAuditResult',id,schema_version:2,version:1,created_at:time.recorded_at,recorded_at:time.recorded_at,updated_at:time.recorded_at,deleted_at:null,state:'recorded',retention_class:'audit',tenant_id:f.p.tenantId,site_id:f.site,crawl_id:f.id,check_id:'A02',check_version:'1.1.0',result:'fail',effect:'reject_outputs',reason:'independent fixture rejection',knowledge_seq:time.knowledge_seq,scope:'outputs',scope_complete:true,dependency_snapshot_hash:'0'.repeat(64),recovery_of_id:null};const fields=Object.entries(row);await c.query(`INSERT INTO self_audit_result (${fields.map(([k])=>k).join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(([,v])=>v));await c.query('INSERT INTO audit_impact VALUES($1,$2,$3,$4,true)',[f.p.tenantId,f.site,id,target]);});}finally{await evaluator.end();}
}
test('Current release, source audit, deletion and robots freshness fence seed classification and replay',async t=>{
 for(const gate of ['revoke','audit','delete','freshness'] as const){const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));if(gate==='revoke')await registry.change(f.release,'revoked','fixture');if(gate==='audit')await rejectSource(f,f.acceptance.bodyEvidenceId!);if(gate==='delete')await deletions.record(f.p.tenantId,f.site);if(gate==='freshness'){const c=await admin.connect();try{await c.query('BEGIN');await c.query("SET LOCAL session_replication_role='replica'");await c.query("UPDATE aios.observation SET observed_at=clock_timestamp()-interval '2 seconds',fresh_until=clock_timestamp()-interval '1 second' WHERE id=$1",[f.acceptance.observationId]);await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}}
  const before=await state(f);await assert.rejects(worker.admitHttpBootstrapSeed(f.lease),/skill_revoked|audit_input_rejected|deleted_scope|source_unavailable|stale|expired/);assert.deepEqual(await state(f),before);
 }
});
test('Source reads do not hold a work lock and current changes before final commit prevent admission',async t=>{
 for(const gate of ['cancel','revoke','audit'] as const){const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));let changed=false;const guarded=new Jobs(scheduler,deletions,{read:async(...args)=>{const bytes=await blobs.read(...args);if(changed)return bytes;changed=true;const c=await admin.connect();try{await c.query('BEGIN');assert.equal((await c.query('SELECT pg_try_advisory_xact_lock(68273433) AS acquired')).rows[0].acquired,true);}finally{await c.query('ROLLBACK');c.release();}if(gate==='cancel')await commands.cancel(f.p,f.site,f.id);if(gate==='revoke')await registry.change(f.release,'revoked','fixture');if(gate==='audit')await rejectSource(f);return bytes;}});
  const before=await state(f);await assert.rejects(guarded.admitHttpBootstrapSeed(f.lease),/run_fenced|skill_revoked|audit_input_rejected/);assert.equal(changed,true);const after=await state(f);assert.deepEqual(after.counts,before.counts);assert.equal(after.bundles,before.bundles);assert.deepEqual(after.target,before.target);
 }
});
test('Changed or missing retained robots or scope bytes cannot authorize a submitted seed',async t=>{
 for(const [source,missing] of [['body',false],['body',true],['scope',false],['scope',true]] as const){const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));const row=(await admin.query('SELECT artifact_key FROM aios.evidence WHERE id=$1',[source==='body'?f.acceptance.bodyEvidenceId:f.scope.evidenceId])).rows[0],path=join(process.env.AIOS_TEST_ROOT!,'http-seed-blobs',row.artifact_key.replaceAll('/','_'));if(missing)await unlink(path);else await writeFile(path,'changed source');const before=await state(f);await assert.rejects(worker.admitHttpBootstrapSeed(f.lease),/artifact_integrity_failed|ENOENT|source_unavailable/);assert.deepEqual(await state(f),before);}
});
test('Seed admission survives PostgreSQL restart and completed replay remains currently governed',async t=>{
 const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));const r=await worker.admitHttpBootstrapSeed(f.lease),before=await state(f);
 for(const pool of [runtime,scheduler,operator,supervisorPool,acceptorPool,admin])await pool.end();execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',process.env.AIOS_TEST_DATA!,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart']);
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});acceptorPool=new pg.Pool({...cfg,user:'aios_http_acceptor'});ledger=new Ledger(runtime,blobs,'local-synthetic-v1');commands=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions,blobs,undefined,acceptorPool);registry=new Registry(operator);lane=new HttpLane(scheduler,deletions);supervisor=new HttpSupervisor(supervisorPool);
 assert.deepEqual(await worker.admitHttpBootstrapSeed(f.lease),r);assert.deepEqual(await state(f),before);await registry.change(f.release,'revoked','fixture');await assert.rejects(worker.admitHttpBootstrapSeed(f.lease),/skill_revoked/);assert.deepEqual(await state(f),before);
});
if(process.env.AIOS_TEST_HTTP_SEED==='1')test('Actual isolated bootstrap ends in submitted seed classification without fetching the page',async t=>{
 const f=await scenario();t.after(()=>commands.cancel(f.p,f.site,f.id));const requests:string[]=[];const server=await localFixture((req,res)=>{requests.push(req.url!);res.writeHead(200,{'content-type':'text/plain'});res.end(reviewedBody);});t.after(server.close);
 const prefix=process.env.AIOS_DOCKER_CONTEXT?['--context',process.env.AIOS_DOCKER_CONTEXT]:[],imageDigest=execFileSync('docker',[...prefix,'image','inspect','aios-seo-http-fixture','--format','{{.Id}}'],{encoding:'utf8'}).trim().replace(/^sha256:/,'');const engine=new DockerHttpFixtureEngine({imageDigest,...(process.env.AIOS_DOCKER_CONTEXT?{dockerContext:process.env.AIOS_DOCKER_CONTEXT}:{})});
 const before=await counts(),r=await new IsolatedHttpFixtureSupervisor(worker,lane,supervisor,engine).collectAcceptAndProject(f.lease,{fixturePort:server.port}),seed=await worker.admitHttpBootstrapSeed(f.lease);assert.equal(seed.state,'queued');assert.equal(seed.admitted,true);assert.equal(seed.observationId,r.acceptance.observationId);assert.deepEqual(requests,['/robots.txt']);assert.equal((await counts()).pages,before.pages);assert.equal((await admin.query('SELECT state FROM aios.crawl WHERE id=$1',[f.id])).rows[0].state,'running');assert.deepEqual(await worker.admitHttpBootstrapSeed(f.lease),seed);
});
test('Existing run-wide admitted occupancy defers the submitted seed without exceeding 500 targets',async t=>{
 const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));const seed=await target(f);
 // Owner-only budget fixture: previously admitted independent link targets, not
 // fabricated sitemap observations or production discovery evidence.
 await admin.query("INSERT INTO aios.crawl_target SELECT (jsonb_populate_record(NULL::aios.crawl_target,to_jsonb(t)||jsonb_build_object('id',gen_random_uuid(),'url',$2||'/p'||n,'url_key',$2||'/p'||n,'state','queued','admitted',true,'seed_kind','link','discovered_from_id',t.id,'depth',1,'priority',3))).* FROM aios.crawl_target t CROSS JOIN generate_series(1,500) n WHERE t.id=$1",[seed.id,f.origin]);
 const r=await worker.admitHttpBootstrapSeed(f.lease);assert.equal(r.state,'deferred');assert.equal(r.reason,'admission_budget');assert.equal(r.admitted,false);assert.equal((await admin.query('SELECT count(*) FROM aios.crawl_target WHERE crawl_id=$1 AND admitted',[f.id])).rows[0].count,'500');
});
test('Service roles cannot bypass immutable seed receipt or directly mutate the target classification',async t=>{
 const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));const seed=await target(f),before=await state(f);
 for(const pool of [runtime,scheduler,acceptorPool,supervisorPool]){
  await assert.rejects(pool.query('INSERT INTO aios.http_bootstrap_seed_admission SELECT * FROM aios.http_bootstrap_seed_admission WHERE false'),/permission denied/);
  const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.p.tenantId]);await assert.rejects(c.query("UPDATE aios.crawl_target SET admitted=true,state='queued' WHERE id=$1",[seed.id]),/permission denied/);}finally{await c.query('ROLLBACK');c.release();}
 }
 assert.deepEqual(await state(f),before);
});
test('Legacy sitemap expansion shares the seed robots context and cannot substitute a newer observation',async t=>{
 const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));await worker.admitHttpBootstrapSeed(f.lease);const seed=await target(f);
 const capture=()=>({attemptId:randomUUID(),capturedAt:new Date(Date.now()-1000).toISOString()});
 const receipt=(path:string,mime:string)=>({url:f.origin+path,final_url:f.origin+path,method:'GET' as const,status_code:200,headers:[{name:'content-type',value:mime}],truncated:false,error:null});
 const sitemap=await ledger.acceptHttpFixture(f.p,f.site,capture(),receipt('/sitemap.xml','application/xml'),Buffer.from('<urlset><url><loc>'+f.origin+'/services</loc></url></urlset>'));
 const alternate=await ledger.acceptHttpFixture(f.p,f.site,capture(),receipt('/robots.txt','text/plain'),Buffer.from('User-agent: *\nDisallow: /\n'));
 const bundle=async(robots:{bodyEvidenceId:string|null;receiptEvidenceId:string;observationId:string})=>ledger.freeze(f.p,f.site,await ledger.cutoff(f.p,f.site),[f.scope.evidenceId,robots.bodyEvidenceId!,robots.receiptEvidenceId,sitemap.bodyEvidenceId!,sitemap.receiptEvidenceId],[f.scope.observationId,robots.observationId,sitemap.observationId]);
 const changed=await bundle(alternate),frontier=new FixtureFrontier(runtime,deletions,blobs);
 await assert.rejects(frontier.discoverSitemap(f.p,f.site,f.id,changed,sitemap.observationId,alternate.observationId),/robots_context_conflict/);
 await assert.rejects(transaction(runtime,'aios_runtime',async c=>{await scope(c,f.p,f.site);return c.query('SELECT control.discover_fixture_sitemap($1,$2,$3,$4,$5,$6,$7)',[f.id,changed,sitemap.observationId,alternate.observationId,manifestHash({fixture:'different-robots'}),JSON.stringify([{url:f.origin+'/services',priority:1,allowed:true}]),{invalid:0,action:0,outOfScope:0,budget:0}]);}),/robots_context_conflict/);
 const same=await bundle(f.acceptance),expanded=await frontier.discoverSitemap(f.p,f.site,f.id,same,sitemap.observationId,f.acceptance.observationId);assert.equal(expanded.inserted_count,1);assert.deepEqual(await target(f),seed);
});
test('Historical seed replay preserves later work state but rejects missing original supporting links',async t=>{
 const f=await completed();t.after(()=>commands.cancel(f.p,f.site,f.id));const r=await worker.admitHttpBootstrapSeed(f.lease);
 await admin.query("UPDATE aios.crawl_target SET state='visited',attempts=1,version=version+1 WHERE id=$1",[r.targetId]);const after=await state(f);assert.deepEqual(await worker.admitHttpBootstrapSeed(f.lease),r);assert.deepEqual(await state(f),after);
 const c=await admin.connect();try{await c.query('BEGIN');await c.query("SET LOCAL session_replication_role='replica'");await c.query('DELETE FROM aios.record_link WHERE owner_id=$1 AND target_id=$2',[r.targetId,r.bundleId]);await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}
 const changed=await state(f);await assert.rejects(worker.admitHttpBootstrapSeed(f.lease),/source_context_changed|artifact_integrity_failed|conflict|seed/);assert.deepEqual(await state(f),changed);
});
