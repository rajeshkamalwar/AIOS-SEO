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
import { IsolatedHttpFixtureSupervisor } from '../packages/jobs/isolated-http-fixture-supervisor.js';
import { DockerHttpFixtureEngine,type HttpFixtureEngine } from '../packages/jobs/docker-http-fixture.js';
import { DeletionLedger } from '../packages/policy/deletion.js';
import { canonical,manifestHash,hash,base,validate } from '../packages/contracts/index.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_http_projection_test'};
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
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_http_projection_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator','aios_http_supervisor','aios_http_acceptor'])await admin.query(`ALTER ROLE ${role} LOGIN`);
 runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});supervisor=new HttpSupervisor(supervisorPool);
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'http-projection-blobs'),'local-synthetic-v1');ledger=new Ledger(runtime,blobs,'local-synthetic-v1');
 deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'http-projection-deletions'));
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
async function checkpoint(f:Awaited<ReturnType<typeof accepted>>){return {counts:await counts(),clock:(await admin.query('SELECT seq FROM aios.knowledge_clock WHERE tenant_id=$1',[f.p.tenantId])).rows[0].seq,job:(await admin.query('SELECT state,result_ref FROM aios.job WHERE job_id=$1',[f.lease.jobId])).rows[0]};}
test('Accepted robots bytes project a bounded result and atomically complete only the fetch child',async t=>{
 const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await checkpoint(f),r=await worker.projectHttpBootstrapFixture(f.lease);
 validate(base+'http-bootstrap-projection.schema.json',r);assert.equal(r.invocationId,f.acceptance.invocationId);assert.equal(r.observationId,f.acceptance.observationId);assert.equal(r.bodyEvidenceId,f.acceptance.bodyEvidenceId);assert.equal(r.receiptEvidenceId,f.acceptance.receiptEvidenceId);assert.equal(r.state,'known');assert.equal(r.reason,'parsed');assert.equal(r.policyVersion,'discovery-v1');assert.equal(r.parserVersion,'robots-v1');assert.equal(r.contextHash,hash(await ledger.artifact(f.p,f.site,f.acceptance.receiptEvidenceId)));
 const after=await checkpoint(f);assert.deepEqual(after.job,{state:'completed',result_ref:f.acceptance.observationId});assert.equal(after.counts.evidence,before.counts.evidence);assert.equal(after.counts.observations,before.counts.observations);assert.equal(after.counts.pages,before.counts.pages);assert.equal(after.counts.renders,before.counts.renders);assert.equal(Number(after.counts.events),Number(before.counts.events)+1);assert.equal(Number(after.clock),Number(before.clock)+1);
 const crawl=(await admin.query('SELECT state FROM aios.crawl WHERE id=$1',[f.id])).rows[0];assert.equal(crawl.state,'running');const event=(await ledger.pending(f.p,f.site)).find(e=>e.event_type==='job.completed'&&(e.payload as any).job_id===f.lease.jobId);assert.ok(event);validate(base+'event.schema.json',event);assert.equal((event.payload as any).result_ref,f.acceptance.observationId);
 assert.deepEqual(await worker.projectHttpBootstrapFixture(f.lease),r);assert.deepEqual(await checkpoint(f),after);
});
test('Robots status outcomes preserve known, denied and unknown without inventing page coverage',async t=>{
 for(const [status,state,reason] of [[404,'known','not_available'],[410,'known','not_available'],[401,'denied','access_denied'],[403,'denied','access_denied'],[429,'unknown','unavailable_or_incomplete'],[503,'unknown','unavailable_or_incomplete']] as const){const f=await accepted((_req,res)=>{res.writeHead(status,{'content-type':'text/plain'});res.end(reviewedBody);});t.after(()=>commands.cancel(f.p,f.site,f.id));const r=await worker.projectHttpBootstrapFixture(f.lease);assert.equal(r.state,state);assert.equal(r.reason,reason);assert.equal((await checkpoint(f)).job.state,'completed');}
 const failed=await accepted(req=>req.socket.destroy());t.after(()=>commands.cancel(failed.p,failed.site,failed.id));const result=await worker.projectHttpBootstrapFixture(failed.lease);assert.equal(result.state,'unknown');assert.equal(result.reason,'transport_failed');assert.equal(result.bodyEvidenceId,null);
});
test('Missing acceptance, forged scope and original attempt proof cannot project or complete',async t=>{
 const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));await assert.rejects(worker.projectHttpBootstrapFixture(f.lease),/acceptance_required|snapshot_unavailable|invalid_receipt|observation_unavailable|source_unavailable/);
 await worker.acceptHttpBootstrapFixture(f.lease,f.input);
 for(const lease of [{...f.lease,token:randomUUID()},{...f.lease,attemptId:randomUUID()},{...f.lease,tenantId:randomUUID()},{...f.lease,siteId:randomUUID()}])await assert.rejects(worker.projectHttpBootstrapFixture(lease),/lease_lost|run_fenced|scope_denied|invalid_receipt/);
 await assert.rejects(worker.complete(f.lease,f.input.invocationId),/handler_not_installed/);assert.equal((await checkpoint({...f,acceptance:{} as any})).job.state,'leased');
});
test('Corrupted or missing accepted body and receipt never project',async t=>{
 for(const [which,change] of [['body','corrupt'],['receipt','corrupt'],['body','missing'],['receipt','missing']] as const){const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await checkpoint(f),id=which==='body'?f.acceptance.bodyEvidenceId!:f.acceptance.receiptEvidenceId,e=(await admin.query('SELECT artifact_key FROM aios.evidence WHERE id=$1',[id])).rows[0],path=join(process.env.AIOS_TEST_ROOT!,'http-projection-blobs',e.artifact_key.replaceAll('/','_'));
  if(change==='corrupt')await writeFile(path,'altered retained source');else await unlink(path);await assert.rejects(worker.projectHttpBootstrapFixture(f.lease),/artifact_integrity_failed|ENOENT|artifact_unavailable/);assert.deepEqual(await checkpoint(f),before);
 }
});
test('Current release, cancellation, deletion and expired lease fence the first projection',async t=>{
 for(const gate of ['revoke','cancel','delete','expire'] as const){const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));if(gate==='revoke')await registry.change(f.release,'revoked','fixture');if(gate==='cancel')await commands.cancel(f.p,f.site,f.id);if(gate==='delete')await deletions.record(f.p.tenantId,f.site);if(gate==='expire')await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",[f.lease.jobId]);const before=await checkpoint(f);await assert.rejects(worker.projectHttpBootstrapFixture(f.lease),/skill_revoked|run_fenced|deleted_scope|lease_lost/);assert.deepEqual(await checkpoint(f),before);}
});
test('Completion event failure atomically rolls back result mapping, clock and job completion',async t=>{
 const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await checkpoint(f);await admin.query("CREATE FUNCTION aios.test_http_projection_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'http_projection_outbox_failure'; END $$; CREATE TRIGGER test_http_projection_fail BEFORE INSERT ON aios.outbox FOR EACH ROW WHEN (NEW.event_type='job.completed') EXECUTE FUNCTION aios.test_http_projection_fail()");
 try{await assert.rejects(worker.projectHttpBootstrapFixture(f.lease),/http_projection_outbox_failure/);}finally{await admin.query('DROP TRIGGER test_http_projection_fail ON aios.outbox; DROP FUNCTION aios.test_http_projection_fail()');}assert.deepEqual(await checkpoint(f),before);assert.equal((await admin.query('SELECT * FROM aios.http_bootstrap_projection WHERE job_id=$1',[f.lease.jobId])).rowCount,0);assert.equal((await worker.projectHttpBootstrapFixture(f.lease)).state,'known');
});
test('Concurrent projection and completed replay retain one immutable result and one completion event',async t=>{
 const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await checkpoint(f),[a,b]=await Promise.all([worker.projectHttpBootstrapFixture(f.lease),worker.projectHttpBootstrapFixture(f.lease)]);assert.deepEqual(a,b);const after=await checkpoint(f);assert.equal(Number(after.clock),Number(before.clock)+1);assert.equal(Number(after.counts.events),Number(before.counts.events)+1);
 await assert.rejects(worker.projectHttpBootstrapFixture({...f.lease,token:randomUUID()}),/lease_lost|invalid_receipt/);assert.deepEqual(await checkpoint(f),after);
});

async function rejectSource(f:Awaited<ReturnType<typeof accepted>>,target=f.scope.evidenceId){
 await admin.query('ALTER ROLE aios_evaluator LOGIN');const evaluator=new pg.Pool({...cfg,user:'aios_evaluator'});
 try{await transaction(evaluator,'aios_evaluator',async c=>{await scope(c,f.p,f.site);const time=await tick(c,f.p.tenantId),id=randomUUID();const row={record_type:'SelfAuditResult',id,schema_version:2,version:1,created_at:time.recorded_at,recorded_at:time.recorded_at,updated_at:time.recorded_at,deleted_at:null,state:'recorded',retention_class:'audit',tenant_id:f.p.tenantId,site_id:f.site,crawl_id:f.id,check_id:'A02',check_version:'1.1.0',result:'fail',effect:'reject_outputs',reason:'independent fixture rejection',knowledge_seq:time.knowledge_seq,scope:'outputs',scope_complete:true,dependency_snapshot_hash:'0'.repeat(64),recovery_of_id:null};const fields=Object.entries(row);await c.query(`INSERT INTO self_audit_result (${fields.map(([k])=>k).join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(([,v])=>v));await c.query('INSERT INTO audit_impact VALUES($1,$2,$3,$4,true)',[f.p.tenantId,f.site,id,target]);});}finally{await evaluator.end();}
}
test('Independent rejection of accepted evidence blocks projection and completed replay',async t=>{
 for(const completed of [false,true]){const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));if(completed)await worker.projectHttpBootstrapFixture(f.lease);await rejectSource(f,f.acceptance.bodyEvidenceId!);const before=await checkpoint(f);await assert.rejects(worker.projectHttpBootstrapFixture(f.lease),/audit_input_rejected/);assert.deepEqual(await checkpoint(f),before);}
});
test('Artifact reads release the work lock and recheck release, cancellation, expiry and audit before commit',async t=>{
 for(const gate of ['revoke','cancel','expire','audit'] as const){const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));let changed=false;const guarded=new Jobs(scheduler,deletions,{read:async(...args)=>{
  const bytes=await blobs.read(...args);if(changed)return bytes;changed=true;const c=await admin.connect();try{await c.query('BEGIN');assert.equal((await c.query('SELECT pg_try_advisory_xact_lock(68273433) AS acquired')).rows[0].acquired,true);}finally{await c.query('ROLLBACK');c.release();}
  if(gate==='revoke')await registry.change(f.release,'revoked','fixture');if(gate==='cancel')await commands.cancel(f.p,f.site,f.id);if(gate==='expire')await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",[f.lease.jobId]);if(gate==='audit')await rejectSource(f);return bytes;
 }});const before=await counts();await assert.rejects(guarded.projectHttpBootstrapFixture(f.lease),/skill_revoked|run_fenced|lease_lost|audit_input_rejected/);assert.equal(changed,true);assert.deepEqual(await counts(),before);}
});
test('Historical terminal or invocation binding alteration cannot authorize first projection or completed replay',async t=>{
 for(const changed of ['terminal','image','context','replay-terminal'] as const){
  const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));if(changed==='replay-terminal')await worker.projectHttpBootstrapFixture(f.lease);
  const c=await admin.connect();try{await c.query('BEGIN');await c.query("SET LOCAL session_replication_role='replica'");
   if(changed==='terminal'||changed==='replay-terminal')await c.query('UPDATE aios.http_terminal_receipt SET result_digest=$2 WHERE receipt_id=$1',[f.input.terminalReceiptId,'a'.repeat(64)]);
   else if(changed==='image')await c.query('UPDATE aios.http_invocation SET collector_build_digest=$2 WHERE invocation_id=$1',[f.input.invocationId,'b'.repeat(64)]);
   else await c.query('UPDATE aios.http_invocation SET input_context_hash=$2 WHERE invocation_id=$1',[f.input.invocationId,'c'.repeat(64)]);
   await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}
  const before=await checkpoint(f);await assert.rejects(worker.projectHttpBootstrapFixture(f.lease),/invalid_receipt|artifact_integrity_failed|source_context_changed/);assert.deepEqual(await checkpoint(f),before);
 }
});
test('Completed replay survives actual PostgreSQL restart and still applies current revocation',async t=>{
 const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));const result=await worker.projectHttpBootstrapFixture(f.lease),before=await checkpoint(f);
 for(const pool of [runtime,scheduler,operator,supervisorPool,acceptorPool,admin])await pool.end();execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',process.env.AIOS_TEST_DATA!,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart']);
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});acceptorPool=new pg.Pool({...cfg,user:'aios_http_acceptor'});ledger=new Ledger(runtime,blobs,'local-synthetic-v1');commands=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions,blobs,undefined,acceptorPool);registry=new Registry(operator);lane=new HttpLane(scheduler,deletions);supervisor=new HttpSupervisor(supervisorPool);
 assert.deepEqual(await worker.projectHttpBootstrapFixture(f.lease),result);assert.deepEqual(await checkpoint(f),before);await registry.change(f.release,'revoked','fixture');await assert.rejects(worker.projectHttpBootstrapFixture(f.lease),/skill_revoked/);assert.deepEqual(await checkpoint(f),before);
});
if(process.env.AIOS_TEST_HTTP_PROJECTION==='1')test('Actual isolated Docker path projects accepted reviewed robots evidence and atomically completes its fetch child',async t=>{
 const f=await scenario();t.after(()=>commands.cancel(f.p,f.site,f.id));let hits=0;const server=await localFixture((req,res)=>{hits++;assert.equal(req.url,'/robots.txt');res.writeHead(200,{'content-type':'text/plain'});res.end(reviewedBody);});t.after(server.close);
 const prefix=process.env.AIOS_DOCKER_CONTEXT?['--context',process.env.AIOS_DOCKER_CONTEXT]:[],imageDigest=execFileSync('docker',[...prefix,'image','inspect','aios-seo-http-fixture','--format','{{.Id}}'],{encoding:'utf8'}).trim().replace(/^sha256:/,'');const engine=new DockerHttpFixtureEngine({imageDigest,...(process.env.AIOS_DOCKER_CONTEXT?{dockerContext:process.env.AIOS_DOCKER_CONTEXT}:{})});
 const before=await counts(),r=await new IsolatedHttpFixtureSupervisor(worker,lane,supervisor,engine).collectAcceptAndProject(f.lease,{fixturePort:server.port});assert.equal(hits,1);assert.equal(r.execution.state,'completed');assert.equal(r.projection.state,'known');assert.equal(r.projection.reason,'parsed');assert.equal(r.projection.observationId,r.acceptance.observationId);assert.deepEqual(await ledger.artifact(f.p,f.site,r.acceptance.bodyEvidenceId!),reviewedBody);assert.equal((await admin.query('SELECT state FROM aios.job WHERE job_id=$1',[f.lease.jobId])).rows[0].state,'completed');assert.equal((await counts()).pages,before.pages);
 const removed=spawnSync('docker',[...prefix,'container','inspect',r.execution.containerId],{encoding:'utf8'});assert.notEqual(removed.status,0);assert.match(removed.stderr,/No such (?:container|object)/i);assert.deepEqual(await worker.projectHttpBootstrapFixture(f.lease),r.projection);
});
test('A successful HTML response is unavailable robots data even when a colon makes its bytes parseable',async t=>{
 const html=await readFile('spec/fixtures/home.html');assert.ok(html.includes(Buffer.from('https:')));
 const f=await accepted((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(html);});t.after(()=>commands.cancel(f.p,f.site,f.id));
 const r=await worker.projectHttpBootstrapFixture(f.lease);assert.equal(r.state,'unknown');assert.equal(r.reason,'unavailable_or_incomplete');assert.equal(r.bodyEvidenceId,f.acceptance.bodyEvidenceId);
});
test('Scheduler cannot insert projection rows or complete fetch jobs by direct state updates',async t=>{
 const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await checkpoint(f);
 for(const [sql,args] of [
  ['INSERT INTO aios.http_bootstrap_projection SELECT * FROM aios.http_bootstrap_projection WHERE false',[]],
  ["UPDATE aios.job SET state='completed',result_ref=$2,lease_token=NULL,lease_until=NULL WHERE job_id=$1",[f.lease.jobId,f.acceptance.observationId]],
 ] as [string,unknown[]][]){const c=await scheduler.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.p.tenantId]);await assert.rejects(async()=>{await c.query(sql,args);await c.query('COMMIT');},/permission denied|projection_required|immutable|handler_not_installed|completion/);}finally{await c.query('ROLLBACK');c.release();}}
 assert.deepEqual(await checkpoint(f),before);
});
test('Direct SQL projection rejects substituted body bytes and status-inconsistent result meaning',async t=>{
 const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));const receipt=await ledger.artifact(f.p,f.site,f.acceptance.receiptEvidenceId),obs=await ledger.observation(f.p,f.site,f.acceptance.observationId);
 const result={...f.acceptance,contextHash:hash(receipt),state:'known',reason:'parsed',policyVersion:'discovery-v1',parserVersion:'robots-v1',freshUntil:obs.fresh_until};const before=await checkpoint(f);
 for(const [body,resultValue] of [[Buffer.from('User-agent: *\nDisallow: /\n'),result],[reviewedBody,{...result,reason:'not_available'}]] as const){const c=await scheduler.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.p.tenantId]);await assert.rejects(c.query('SELECT * FROM control.project_http_bootstrap_fixture($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[f.p.tenantId,f.site,f.id,f.lease.jobId,f.lease.attempt,f.lease.attemptId,f.lease.token,receipt.toString(),body,resultValue]),/artifact_integrity_failed|invalid_receipt|invalid_result|schema_invalid/);}finally{await c.query('ROLLBACK');c.release();}}
 assert.deepEqual(await checkpoint(f),before);
});
