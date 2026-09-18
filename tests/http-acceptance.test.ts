import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID,generateKeyPairSync,sign } from 'node:crypto';
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
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
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_http_acceptance_test'};
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
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_http_acceptance_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator','aios_http_supervisor','aios_http_acceptor'])await admin.query(`ALTER ROLE ${role} LOGIN`);
 runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});supervisor=new HttpSupervisor(supervisorPool);
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'http-acceptance-blobs'),'local-synthetic-v1');ledger=new Ledger(runtime,blobs,'local-synthetic-v1');
 deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'http-acceptance-deletions'));
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
async function accepted(){const f=await executed();return {...f,acceptance:await worker.acceptHttpBootstrapFixture(f.lease,f.input)};}
async function counts(){return (await admin.query('SELECT (SELECT count(*) FROM aios.evidence) evidence,(SELECT count(*) FROM aios.observation) observations,(SELECT count(*) FROM aios.outbox) events,(SELECT count(*) FROM aios.page_snapshot) pages,(SELECT count(*) FROM aios.render_snapshot) renders')).rows[0];}
async function noWrites(call:()=>Promise<unknown>,error:RegExp){const before=await counts(),put=blobs.put;let uploads=0;blobs.put=async function(key,data){uploads++;return put.call(this,key,data);};try{await assert.rejects(call(),error);assert.equal(uploads,0);assert.deepEqual(await counts(),before);}finally{blobs.put=put;}}
test('Governed HTTP terminal handoff retains exact reviewed body and canonical receipt atomically without job completion',async t=>{
 const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await counts(),a=await worker.acceptHttpBootstrapFixture(f.lease,f.input);
 assert.equal(a.invocationId,f.input.invocationId);assert.ok(a.bodyEvidenceId);assert.deepEqual(await ledger.artifact(f.p,f.site,a.bodyEvidenceId!),reviewedBody);
 const receiptBytes=await ledger.artifact(f.p,f.site,a.receiptEvidenceId),receipt=JSON.parse(receiptBytes.toString());validate(base+'http-receipt.schema.json',receipt);assert.equal(receipt.url,f.origin+'/robots.txt');assert.equal(receipt.status_code,200);assert.equal(receipt.body_evidence_id,a.bodyEvidenceId);
 const obs=await ledger.observation(f.p,f.site,a.observationId);assert.equal(obs.context_hash,hash(receiptBytes));assert.equal(obs.state,'observed');assert.deepEqual(new Set(obs.evidence_ids as string[]),new Set([a.bodyEvidenceId,a.receiptEvidenceId]));
 const after=await counts();assert.equal(Number(after.evidence)-Number(before.evidence),2);assert.equal(Number(after.observations)-Number(before.observations),1);assert.equal(after.pages,before.pages);assert.equal(after.renders,before.renders);
 const job=(await admin.query('SELECT state,result_ref FROM aios.job WHERE job_id=$1',[f.lease.jobId])).rows[0];assert.deepEqual(job,{state:'leased',result_ref:null});
 const pending=await ledger.pending(f.p,f.site);const event=pending.find(e=>(e.payload as any).observation_id===a.observationId);assert.ok(event);validate(base+'event.schema.json',event);
 const stored=(await admin.query('SELECT actual_bytes,settled_at FROM aios.http_reservation WHERE invocation_id=$1',[a.invocationId])).rows[0];assert.equal(stored.actual_bytes,null);assert.ok(stored.settled_at);
});
test('Exact acceptance replay and concurrent duplicate preserve IDs with one durable effect and no new uploads',async t=>{
 const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));const [a,b]=await Promise.all([worker.acceptHttpBootstrapFixture(f.lease,f.input),worker.acceptHttpBootstrapFixture(f.lease,f.input)]);assert.deepEqual(a,b);
 const before=await counts(),put=blobs.put;let uploads=0;blobs.put=async function(key,data){uploads++;return put.call(this,key,data);};try{assert.deepEqual(await worker.acceptHttpBootstrapFixture(f.lease,f.input),a);assert.equal(uploads,0);assert.deepEqual(await counts(),before);}finally{blobs.put=put;}
 await noWrites(()=>worker.acceptHttpBootstrapFixture(f.lease,{...f.input,body:Buffer.from('User-agent: *\nDisallow: /\n')}),/conflict|invalid_receipt/);
});
test('Body, header, terminal, scope and attempt tampering cannot authorize acceptance',async t=>{
 const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));
 const variants:AcceptanceInput[]=[{...f.input,body:Buffer.from('User-agent: *\nDisallow: /\n')},{...f.input,result:{...f.input.result,status_code:404}},{...f.input,terminalReceiptId:randomUUID()},{...f.input,invocationId:randomUUID()},{...f.input,imageDigest:'b'.repeat(64)},{...f.input,containerId:'c'.repeat(64)},{...f.input,fixturePort:f.input.fixturePort===65535?65534:f.input.fixturePort+1}];
 for(const value of variants)await noWrites(()=>worker.acceptHttpBootstrapFixture(f.lease,value),/invalid_receipt|conflict/);
 for(const lease of [{...f.lease,token:randomUUID()},{...f.lease,attemptId:randomUUID()},{...f.lease,tenantId:randomUUID()}])await noWrites(()=>worker.acceptHttpBootstrapFixture(lease,f.input),/lease_lost|run_fenced|scope_denied|invalid_receipt/);
});
test('Unreviewed body and opaque allowed-header contents cause zero uploads after honest terminal accounting',async t=>{
 for(const mode of ['body','header'] as const){const f=await executed((_req,res)=>{res.writeHead(200,{'content-type':'text/plain',...(mode==='header'?{etag:'"HEADER_SECRET"'}:{})});res.end(mode==='body'?'User-agent: *\n# UNKNOWN_SECRET\n':reviewedBody);});t.after(()=>commands.cancel(f.p,f.site,f.id));await noWrites(()=>worker.acceptHttpBootstrapFixture(f.lease,f.input),/unreviewed_fixture/);}
});
test('Revocation, cancellation, deletion and lease expiry before acceptance reject without uploads',async t=>{
 for(const gate of ['revoke','cancel','delete','expire'] as const){const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));
  if(gate==='revoke')await registry.change(f.release,'revoked','fixture');if(gate==='cancel')await commands.cancel(f.p,f.site,f.id);if(gate==='delete')await deletions.record(f.p.tenantId,f.site);if(gate==='expire')await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",[f.lease.jobId]);
  await noWrites(()=>worker.acceptHttpBootstrapFixture(f.lease,f.input),/skill_revoked|run_fenced|deleted_scope|lease_lost/);
 }
});
test('Cancellation during body upload rolls back all accepted records and preserves unknown-byte accounting',async t=>{
 const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await counts(),put=blobs.put;let cancelled=false;
 blobs.put=async function(key,data){await put.call(this,key,data);if(!cancelled){cancelled=true;await commands.cancel(f.p,f.site,f.id);}};
 try{await assert.rejects(worker.acceptHttpBootstrapFixture(f.lease,f.input),/run_fenced|lease_lost/);}finally{blobs.put=put;}
 assert.equal(cancelled,true);assert.deepEqual(await counts(),before);assert.equal((await admin.query('SELECT actual_bytes FROM aios.http_reservation WHERE invocation_id=$1',[f.input.invocationId])).rows[0].actual_bytes,null);
});
test('A closed transport failure retains an honest failure receipt and no invented body',async t=>{
 const f=await executed(req=>{req.socket.destroy();});t.after(()=>commands.cancel(f.p,f.site,f.id));const a=await worker.acceptHttpBootstrapFixture(f.lease,f.input);assert.equal(a.bodyEvidenceId,null);const receipt=JSON.parse((await ledger.artifact(f.p,f.site,a.receiptEvidenceId)).toString());assert.equal(receipt.status_code,null);assert.equal(receipt.body_evidence_id,null);assert.ok(receipt.error);assert.equal((await ledger.observation(f.p,f.site,a.observationId)).state,'failed');
});
test('Outbox failure atomically rolls back acceptance and remains retryable',async t=>{
 const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await counts();await admin.query("CREATE FUNCTION aios.test_http_acceptance_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'http_acceptance_outbox_failure'; END $$; CREATE TRIGGER test_http_acceptance_fail BEFORE INSERT ON aios.outbox FOR EACH ROW EXECUTE FUNCTION aios.test_http_acceptance_fail()");
 try{await assert.rejects(worker.acceptHttpBootstrapFixture(f.lease,f.input),/http_acceptance_outbox_failure/);}finally{await admin.query('DROP TRIGGER test_http_acceptance_fail ON aios.outbox; DROP FUNCTION aios.test_http_acceptance_fail()');}assert.deepEqual(await counts(),before);assert.ok((await worker.acceptHttpBootstrapFixture(f.lease,f.input)).receiptEvidenceId);
});
test('Missing independent acceptor credentials fail before upload',async t=>{const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));await noWrites(()=>new Jobs(scheduler,deletions,blobs).acceptHttpBootstrapFixture(f.lease,f.input),/http_acceptor_required/);});
test('Oversized body and malformed transcript fail before any upload',async t=>{
 const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));
 for(const value of [{...f.input,body:Buffer.alloc(512001)},{...f.input,transcript:null},{...f.input,transcript:{...f.input.transcript,workerConformance:'invalid'}},{...f.input,transcript:{...f.input.transcript,exitCode:'0'}},{...f.input,transcript:{...f.input.transcript,protocolViolation:true}},{...f.input,transcript:{...f.input.transcript,brokerResult:{...f.input.transcript.brokerResult,status:404}}}])await noWrites(()=>worker.acceptHttpBootstrapFixture(f.lease,value as AcceptanceInput),/invalid_input|invalid_receipt|response_too_large|schema_invalid/);
});
test('Protocol violation, nonzero worker exit and uncertain cleanup never reach private acceptance',async t=>{
 for(const mode of ['duplicate','forged','exit','uncertain'] as const){const f=await scenario(),server=await localFixture((_req,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.end(reviewedBody);});t.after(server.close);t.after(()=>commands.cancel(f.p,f.site,f.id));
  const engine=fakeEngine({repeat:mode==='duplicate',forge:mode==='forged',cleanupFails:mode==='uncertain'});if(mode==='exit')engine.cleanup=async()=>({finishedAt:new Date().toISOString(),termination:'exited',exitCode:1});
  let handed=0;const guarded=new Jobs(scheduler,deletions,blobs,undefined,acceptorPool);guarded.acceptHttpBootstrapFixture=async()=>{handed++;throw new Error('must_not_accept');};const before=await counts();
  await assert.rejects(new IsolatedHttpFixtureSupervisor(guarded,lane,supervisor,engine).collectAndAccept(f.lease,{fixturePort:server.port}),/http_result_not_acceptable|container_state_uncertain|result_unavailable|acceptance_unavailable/);assert.equal(handed,0);assert.deepEqual(await counts(),before);
  if(mode==='uncertain'){const row=(await admin.query('SELECT settled_at FROM aios.http_reservation WHERE job_id=$1',[f.lease.jobId])).rows[0];assert.equal(row.settled_at,null);}
 }
});
if(process.env.AIOS_TEST_HTTP_ACCEPTANCE==='1')test('Actual governed Docker and loopback broker retain exact reviewed robots bytes with independent closure and no job completion',async t=>{
 const f=await scenario(),prefix=process.env.AIOS_DOCKER_CONTEXT?['--context',process.env.AIOS_DOCKER_CONTEXT]:[],imageDigest=execFileSync('docker',[...prefix,'image','inspect','aios-seo-http-fixture','--format','{{.Id}}'],{encoding:'utf8'}).trim().replace(/^sha256:/,'');t.after(()=>commands.cancel(f.p,f.site,f.id));let hits=0;
 const server=await localFixture((req,res)=>{hits++;assert.equal(req.url,'/robots.txt');res.writeHead(200,{'content-type':'text/plain'});res.end(reviewedBody);});t.after(server.close);
 const engine=new DockerHttpFixtureEngine({imageDigest,...(process.env.AIOS_DOCKER_CONTEXT?{dockerContext:process.env.AIOS_DOCKER_CONTEXT}:{})});
 const result=await new IsolatedHttpFixtureSupervisor(worker,lane,supervisor,engine).collectAndAccept(f.lease,{fixturePort:server.port});assert.equal(hits,1);assert.equal(result.execution.state,'completed');assert.equal(result.execution.evidenceAccepted,false);assert.ok(!JSON.stringify(result).includes('Disallow:'));
 assert.deepEqual(await ledger.artifact(f.p,f.site,result.acceptance.bodyEvidenceId!),reviewedBody);assert.equal((await ledger.observation(f.p,f.site,result.acceptance.observationId)).state,'observed');
 const removed=spawnSync('docker',[...prefix,'container','inspect',result.execution.containerId],{encoding:'utf8'});assert.notEqual(removed.status,0);assert.match(removed.stderr,/No such (?:container|object)/i);assert.deepEqual((await admin.query('SELECT state,result_ref FROM aios.job WHERE job_id=$1',[f.lease.jobId])).rows[0],{state:'leased',result_ref:null});
});
async function rejectSource(f:Awaited<ReturnType<typeof executed>>){
 await admin.query('ALTER ROLE aios_evaluator LOGIN');const evaluator=new pg.Pool({...cfg,user:'aios_evaluator'});
 try{await transaction(evaluator,'aios_evaluator',async c=>{await scope(c,f.p,f.site);const time=await tick(c,f.p.tenantId),id=randomUUID();const row={record_type:'SelfAuditResult',id,schema_version:2,version:1,created_at:time.recorded_at,recorded_at:time.recorded_at,updated_at:time.recorded_at,deleted_at:null,state:'recorded',retention_class:'audit',tenant_id:f.p.tenantId,site_id:f.site,crawl_id:f.id,check_id:'A02',check_version:'1.1.0',result:'fail',effect:'reject_outputs',reason:'independent fixture rejection',knowledge_seq:time.knowledge_seq,scope:'outputs',scope_complete:true,dependency_snapshot_hash:'0'.repeat(64),recovery_of_id:null};const fields=Object.entries(row);await c.query(`INSERT INTO self_audit_result (${fields.map(([k])=>k).join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(([,v])=>v));await c.query('INSERT INTO audit_impact VALUES($1,$2,$3,$4,true)',[f.p.tenantId,f.site,id,f.scope.evidenceId]);});}finally{await evaluator.end();}
}
test('Independent source rejection before acceptance blocks uploads',async t=>{const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));await rejectSource(f);await noWrites(()=>worker.acceptHttpBootstrapFixture(f.lease,f.input),/audit_input_rejected/);});
test('Release, deletion, expiry and audit changes during upload all fence final acceptance',async t=>{
 for(const gate of ['revoke','delete','expire','audit'] as const){const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await counts(),put=blobs.put;let fenced=false;
  blobs.put=async function(key,data){await put.call(this,key,data);if(fenced)return;fenced=true;if(gate==='revoke')await registry.change(f.release,'revoked','fixture');if(gate==='delete')await deletions.record(f.p.tenantId,f.site);if(gate==='expire')await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",[f.lease.jobId]);if(gate==='audit')await rejectSource(f);};
  try{await assert.rejects(worker.acceptHttpBootstrapFixture(f.lease,f.input),/skill_revoked|deleted_scope|lease_lost|audit_input_rejected/);}finally{blobs.put=put;}
  assert.equal(fenced,true);assert.deepEqual(await counts(),before);
 }
});
test('Artifact upload holds maintenance protection without a work lock',async t=>{
 const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));const put=blobs.put;let checked=false;
 blobs.put=async function(key,data){await put.call(this,key,data);if(checked)return;checked=true;const c=await admin.connect();try{await c.query('BEGIN');assert.equal((await c.query('SELECT pg_try_advisory_xact_lock(68273431) AS acquired')).rows[0].acquired,false);assert.equal((await c.query('SELECT pg_try_advisory_xact_lock(68273433) AS acquired')).rows[0].acquired,true);}finally{await c.query('ROLLBACK');c.release();}};
 try{assert.ok((await worker.acceptHttpBootstrapFixture(f.lease,f.input)).observationId);}finally{blobs.put=put;}assert.equal(checked,true);
});
test('Only independent HTTP acceptor credentials can invoke acceptance and they cannot dispatch or attest termination',async t=>{
 const f=await executed();t.after(()=>commands.cancel(f.p,f.site,f.id));const args=[f.p.tenantId,f.site,f.id,f.lease.jobId,f.lease.attempt,f.lease.attemptId,f.lease.token,f.input.invocationId,f.input.terminalReceiptId,'a'.repeat(64),{}];
 for(const pool of [runtime,scheduler,operator,supervisorPool])await assert.rejects(pool.query('SELECT * FROM control.accept_http_bootstrap_fixture($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',args),/permission denied|service_authority_required/);
 const privileges=(await admin.query("SELECT p.proname,has_function_privilege('aios_http_acceptor',p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='control' AND p.proname IN ('reserve_http_accounting','bind_http_invocation','record_http_terminal','enqueue_http_bootstrap')")).rows;assert.ok(privileges.length>=2);assert.ok(privileges.every(p=>p.allowed===false));
 await assert.rejects(acceptorPool.query('INSERT INTO aios.evidence SELECT * FROM aios.evidence WHERE false'),/permission denied/);assert.ok((await worker.acceptHttpBootstrapFixture(f.lease,f.input)).observationId);
});
test('Accepted HTTP identities and private bytes survive database restart with current-gated replay',async t=>{
 const f=await accepted();t.after(()=>commands.cancel(f.p,f.site,f.id));const before=await counts();
 for(const pool of [runtime,scheduler,operator,supervisorPool,acceptorPool,admin])await pool.end();
 execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',process.env.AIOS_TEST_DATA!,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart']);
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_http_supervisor'});acceptorPool=new pg.Pool({...cfg,user:'aios_http_acceptor'});
 ledger=new Ledger(runtime,blobs,'local-synthetic-v1');commands=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions,blobs,undefined,acceptorPool);registry=new Registry(operator);lane=new HttpLane(scheduler,deletions);supervisor=new HttpSupervisor(supervisorPool);
 assert.deepEqual(await worker.acceptHttpBootstrapFixture(f.lease,f.input),f.acceptance);assert.deepEqual(await counts(),before);assert.deepEqual(await ledger.artifact(f.p,f.site,f.acceptance.bodyEvidenceId!),reviewedBody);
 await registry.change(f.release,'revoked','fixture');await noWrites(()=>worker.acceptHttpBootstrapFixture(f.lease,f.input),/skill_revoked/);
});
