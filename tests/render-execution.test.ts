import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {OfflineRenderFixtureProducer} from '../packages/jobs/offline-render-producer.js';
import {DockerOfflineRenderEngine,type OfflineRenderEngine} from '../packages/jobs/docker-offline-render.js';
import {transaction,scope,tick} from '../packages/persistence/transaction.js';
import {migrate} from '../packages/persistence/migrate.js';
import {Ledger,type Principal} from '../packages/persistence/index.js';
import {LocalBlobs} from '../packages/evidence/index.js';
import {Registry} from '../packages/skills/index.js';
import {Jobs,type Lease} from '../packages/jobs/index.js';
import {FixtureFrontier} from '../packages/jobs/frontier.js';
import {DeletionLedger} from '../packages/policy/deletion.js';
import {canonical,manifestHash} from '../packages/contracts/index.js';
import {RenderLane} from '../packages/jobs/render-lane.js';
import {RenderSupervisor} from '../packages/jobs/render-supervisor.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_render_execution_test'};
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool,supervisorPool:pg.Pool;
let blobs:LocalBlobs,ledger:Ledger,deletions:DeletionLedger,jobs:Jobs,worker:Jobs,registry:Registry,lane:RenderLane,supervisor:RenderSupervisor;
const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID(),author=randomUUID();
function connect(){admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_render_supervisor'});}
function services(){ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions,blobs);registry=new Registry(operator);lane=new RenderLane(scheduler,deletions);supervisor=new RenderSupervisor(supervisorPool);}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_render_execution_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator','aios_render_supervisor'])await admin.query(`ALTER ROLE ${role} LOGIN`);await admin.end();connect();
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'render-execution-blobs'),'local-synthetic-v1');deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'render-execution-deletions'));services();
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");await admin.query('INSERT INTO control.authority_key VALUES($1,$2,true)',[reviewer,keys.publicKey.export({type:'spki',format:'pem'})]);
});
afterEach(async()=>{
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");
 await admin.query("UPDATE aios.membership SET state='active'");
 await admin.query("UPDATE aios.crawl SET state='cancelled' WHERE state IN ('queued','running','blocked')");
 await admin.query("UPDATE aios.job SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE state IN ('queued','leased','retry_wait')");
});
after(async()=>{for(const pool of [runtime,scheduler,operator,supervisorPool,admin])await pool?.end();});
async function fixture(pages=20,requests=2000){
 const p:Principal={tenantId:randomUUID(),userId:randomUUID()};
 for(const [type,table,changes] of [['Tenant','tenant',{id:p.tenantId}],['User','app_user',{id:p.userId,subject:p.userId}],['Membership','membership',{id:randomUUID(),tenant_id:p.tenantId,user_id:p.userId}]] as const){const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes},fields=Object.entries(row).filter(([k])=>!['provenance_ids','site_scope_ids'].includes(k));await admin.query(`INSERT INTO aios.${table} (${fields.map(([k])=>k).join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(([,v])=>v));}
 for(const kind of ['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'])await admin.query('INSERT INTO control.tenant_cap VALUES($1,$2,10000)',[p.tenantId,kind]);
 const manifest=JSON.parse(await readFile('spec/examples/skill-reliability-gate.json','utf8'));manifest.skill_id='seo.test-'+randomUUID().replace(/[0-9]/g,n=>String.fromCharCode(103+Number(n)));manifest.last_verified=new Date().toISOString();manifest.freshness_deadline=new Date(Date.now()+3600000).toISOString();
 const approval={author,reviewer,manifest_digest:manifestHash(manifest),evaluation_digest:manifestHash({fixture:true}),approved_at:new Date().toISOString(),scope:'local-synthetic-v1' as const,dependencies:[]};const digest=await registry.approve(manifest,approval,sign(null,Buffer.from(canonical(approval)),keys.privateKey).toString('base64'));
 const url='https://'+randomUUID()+'.example/',site=await ledger.registerSite(p,url),run=await jobs.submit(p,site,randomUUID(),{http_requests:10,render_requests:requests,render_pages:pages,model_calls:0,tokens:0,cost_microusd:0,deadline:new Date(Date.now()+600000).toISOString()});
 const scope=await ledger.acceptSiteScopeFixture(p,site,run,deletions);
 const observe=async(path:string,body:string,mime:string)=>ledger.acceptHttpFixture(p,site,{attemptId:randomUUID(),capturedAt:new Date(Date.now()-1000).toISOString()},{url:url+path,final_url:url+path,method:'GET',status_code:200,headers:[{name:'content-type',value:mime}],truncated:false,error:null},Buffer.from(body));
 const robots=await observe('robots.txt','User-agent: *\nAllow: /\n','text/plain'),sitemap=await observe('sitemap.xml','<urlset><url><loc>'+url+'</loc></url></urlset>','application/xml');
 const evidence=[scope.evidenceId,robots.receiptEvidenceId,robots.bodyEvidenceId!,sitemap.receiptEvidenceId,sitemap.bodyEvidenceId!],observations=[scope.observationId,robots.observationId,sitemap.observationId];
 const frozen=()=>ledger.cutoff(p,site).then(cutoff=>ledger.freeze(p,site,cutoff,evidence,observations));const admission=await frozen();await new FixtureFrontier(runtime,deletions,blobs).discoverSitemap(p,site,run,admission,sitemap.observationId,robots.observationId);
 const raw=await observe('','<title>Fixture render</title>','text/html');evidence.push(raw.receiptEvidenceId,raw.bodyEvidenceId!);observations.push(raw.observationId);
 const initial=await frozen();await jobs.enqueue(p,site,run,initial,digest,randomUUID(),'project');const first=(await worker.claim())!;const snapshot=await worker.projectHttpFixture(first,raw.observationId),bundle=await frozen();
 const next=async()=>{await jobs.enqueue(p,site,run,bundle,digest,randomUUID(),'project');const l=(await worker.claim())!;assert.ok(l);return l;};const lease=await next();
 const prepared=await worker.prepareOfflineRenderFixture(lease,snapshot);assert.equal(prepared.prepared.state,'prepared');if(prepared.prepared.state!=='prepared')throw new Error('fixture preparation failed');
 const input={pageSnapshotId:snapshot,bundleId:bundle,inputSha256:prepared.prepared.inputSha256,profile:'local-offline-replay-v3' as const};return {p,site,run,digest,snapshot,bundle,lease,next,input,robots};
}
async function renderRelease(change:(manifest:any)=>void=()=>{}){
 const manifest=JSON.parse(await readFile('spec/examples/skill-offline-render-fixture.json','utf8'));
 manifest.skill_id='seo.render-'+randomUUID().replace(/[0-9]/g,n=>String.fromCharCode(103+Number(n)));manifest.last_verified=new Date().toISOString();manifest.freshness_deadline=new Date(Date.now()+3600000).toISOString();change(manifest);
 const approval={author,reviewer,manifest_digest:manifestHash(manifest),evaluation_digest:manifestHash({fixture:true}),approved_at:new Date().toISOString(),scope:'local-synthetic-v1' as const,dependencies:[]};
 return registry.approve(manifest,approval,sign(null,Buffer.from(canonical(approval)),keys.privateKey).toString('base64'));
}

async function child(f:Awaited<ReturnType<typeof fixture>>,digest:string){const id=await worker.enqueueOfflineRenderFixture(f.lease,f.snapshot,digest,randomUUID());const lease=await worker.claim();assert.ok(lease);assert.equal(lease.jobId,id);return lease;}
async function evidenceCounts(){return(await admin.query('SELECT (SELECT count(*) FROM aios.evidence) AS evidence,(SELECT count(*) FROM aios.render_snapshot) AS renders')).rows[0];}
test('Dedicated render child pins independently prepared source without accepting new evidence',async()=>{
 const f=await fixture(),digest=await renderRelease(),before=await evidenceCounts(),key=randomUUID();
 const id=await worker.enqueueOfflineRenderFixture(f.lease,f.snapshot,digest,key);assert.equal(await worker.enqueueOfflineRenderFixture(f.lease,f.snapshot,digest,key),id);
 const lease=(await worker.claim())!;assert.equal(lease.jobId,id);const output=await worker.prepareOfflineRenderExecution(lease);assert.equal(output.prepared.inputSha256,f.input.inputSha256);assert.equal(output.prepared.html,'<title>Fixture render</title>');assert.equal(output.descriptor.pageSnapshotId,f.snapshot);assert.equal(output.descriptor.bundleId,f.bundle);assert.equal(output.descriptor.inputSha256,f.input.inputSha256);assert.equal(output.descriptor.profile,'local-offline-replay-v3');
 assert.deepEqual(await evidenceCounts(),before);
 await assert.rejects(worker.prepareOfflineRenderExecution(f.lease),/handler_not_installed|permission_denied|render_authority_required/);
});
test('Service SQL cannot alter or replace immutable render job source descriptors',async()=>{
 const f=await fixture(),digest=await renderRelease(),id=await worker.enqueueOfflineRenderFixture(f.lease,f.snapshot,digest,randomUUID());
 for(const pool of [runtime,scheduler,operator,supervisorPool]){
  for(const sql of ["INSERT INTO aios.offline_render_job DEFAULT VALUES","UPDATE aios.offline_render_job SET descriptor='{}'::jsonb","DELETE FROM aios.offline_render_job"])await assert.rejects(pool.query(sql),/permission denied|immutable/);
 }
 const row=(await admin.query('SELECT descriptor FROM aios.offline_render_job WHERE job_id=$1',[id])).rows[0];assert.equal(row.descriptor.pageSnapshotId,f.snapshot);assert.equal(row.descriptor.inputSha256,f.input.inputSha256);
});
test('Render release installation rejects missing, wrong-version or overbroad permission and unknown procedure',async()=>{
 for(const change of [
 (m:any)=>{m.tool_permissions=m.tool_permissions.filter((p:any)=>p.tool_id!=='render.observe');},
 (m:any)=>{m.tool_permissions[0].version='2.0.0';},
 (m:any)=>{m.tool_permissions[0].max_calls=2;},
 (m:any)=>{m.tool_permissions.push({tool_id:'artifact.read_scoped',version:'1.0.0',max_calls:10});},
 (m:any)=>{m.procedure[0].operation='invented_render_v1';},
 ])await assert.rejects(renderRelease(change),/handler_not_installed|permission|schema_invalid/);
});
test('A project reliability release cannot authorize a render child; existing child replay cannot change release/source',async()=>{
 const f=await fixture();await assert.rejects(worker.enqueueOfflineRenderFixture(f.lease,f.snapshot,f.digest,randomUUID()),/handler_not_installed|permission|render_authority_required/);
 const digest=await renderRelease(),key=randomUUID();await worker.enqueueOfflineRenderFixture(f.lease,f.snapshot,digest,key);
 const other=await renderRelease();await assert.rejects(worker.enqueueOfflineRenderFixture(f.lease,f.snapshot,other,key),/conflict/);
 await assert.rejects(worker.enqueueOfflineRenderFixture(f.lease,randomUUID(),digest,key),/conflict|snapshot_unavailable/);
});
test('Render child preparation rechecks release revocation, cancellation and independent deletion',async()=>{
 for(const gate of ['revoke','cancel','delete']){const f=await fixture(),digest=await renderRelease(),lease=await child(f,digest),before=await evidenceCounts();
 if(gate==='revoke')await registry.change(digest,'revoked','fixture');else if(gate==='cancel')await jobs.cancel(f.p,f.site,f.run);else await deletions.record(f.p.tenantId,f.site);
 await assert.rejects(worker.prepareOfflineRenderExecution(lease),/skill_revoked|run_fenced|deleted_scope/);assert.deepEqual(await evidenceCounts(),before);
 }
});
test('Current rejected source cannot enter render execution',async()=>{
 const f=await fixture(),digest=await renderRelease(),lease=await child(f,digest);await admin.query('ALTER ROLE aios_evaluator LOGIN');const evaluator=new pg.Pool({...cfg,user:'aios_evaluator'});
 try{await transaction(evaluator,'aios_evaluator',async c=>{await scope(c,f.p,f.site);const time=await tick(c,f.p.tenantId),id=randomUUID();
 const row={record_type:'SelfAuditResult',id,schema_version:2,version:1,created_at:time.recorded_at,recorded_at:time.recorded_at,updated_at:time.recorded_at,deleted_at:null,state:'recorded',retention_class:'audit',tenant_id:f.p.tenantId,site_id:f.site,crawl_id:f.run,check_id:'A02',check_version:'1.1.0',result:'fail',effect:'reject_outputs',reason:'independent fixture rejection',knowledge_seq:time.knowledge_seq,scope:'outputs',scope_complete:true,dependency_snapshot_hash:'0'.repeat(64),recovery_of_id:null};
 const fields=Object.entries(row);await c.query(`INSERT INTO self_audit_result (${fields.map(([k])=>k).join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(([,v])=>v));await c.query('INSERT INTO audit_impact VALUES($1,$2,$3,$4,true)',[f.p.tenantId,f.site,id,f.snapshot]);
 });}finally{await evaluator.end();}
 await assert.rejects(worker.prepareOfflineRenderExecution(lease),/audit_input_rejected/);
});

function fixtureEngine(beforeStart:()=>Promise<void>=async()=>{}){
 let creates=0,starts=0,cleanups=0;const engine:OfflineRenderEngine={browserBuild:'1.2.3.4',async create(){creates++;return{id:manifestHash({fixture:randomUUID()}),imageDigest:'1'.repeat(64)};},async start(_container,_input,options){await beforeStart();await options.beforeStart();starts++;return{state:'exited',stdout:Buffer.from('invalid fixture result')};},async cleanup(){cleanups++;return{finishedAt:new Date().toISOString(),termination:'exited',exitCode:0};}};
 return{engine,counts:()=>({creates,starts,cleanups})};
}
test('Generic project lease is rejected before even a trusted fixture engine is created',async()=>{
 const f=await fixture(),e=fixtureEngine();await assert.rejects(new OfflineRenderFixtureProducer(worker,lane,supervisor,e.engine).collect(f.lease),/handler_not_installed|render_authority_required/);assert.deepEqual(e.counts(),{creates:0,starts:0,cleanups:0});
});
test('Producer cancellation after binding suppresses GO and only settles after trusted cleanup',async()=>{
 const f=await fixture(),lease=await child(f,await renderRelease()),e=fixtureEngine(),before=await evidenceCounts();
 class CancelAfterBind extends RenderSupervisor{override async bindInvocation(binding:Parameters<RenderSupervisor['bindInvocation']>[0]){await super.bindInvocation(binding);await jobs.cancel(f.p,f.site,f.run);}}
 const result=await new OfflineRenderFixtureProducer(worker,lane,new CancelAfterBind(supervisorPool),e.engine).collect(lease);assert.equal(result.state,'failed');assert.equal(result.evidenceAccepted,false);assert.deepEqual(e.counts(),{creates:1,starts:0,cleanups:1});assert.deepEqual(await evidenceCounts(),before);
});
test('Invalid renderer output can settle accounting but cannot become accepted evidence',async()=>{
 const f=await fixture(),lease=await child(f,await renderRelease()),e=fixtureEngine(),before=await evidenceCounts();const result=await new OfflineRenderFixtureProducer(worker,lane,supervisor,e.engine).collect(lease);
 assert.equal(result.state,'failed');assert.equal(result.conformance,'invalid');assert.equal(result.evidenceAccepted,false);assert.deepEqual(e.counts(),{creates:1,starts:1,cleanups:1});assert.deepEqual(await evidenceCounts(),before);
 await assert.rejects(new OfflineRenderFixtureProducer(worker,lane,supervisor,e.engine).collect(lease),/invocation_already_settled/);assert.equal(e.counts().creates,1);
});
test('A render release max_calls=1 remains spent across retry attempts after settlement',async()=>{
 const f=await fixture(),lease=await child(f,await renderRelease()),e=fixtureEngine();await new OfflineRenderFixtureProducer(worker,lane,supervisor,e.engine).collect(lease);
 await worker.fail(lease,'timeout',true);await admin.query('UPDATE aios.job SET available_at=clock_timestamp() WHERE job_id=$1',[lease.jobId]);const retry=(await worker.claim())!;assert.equal(retry.jobId,lease.jobId);assert.equal(retry.attempt,lease.attempt+1);
 await assert.rejects(new OfflineRenderFixtureProducer(worker,lane,supervisor,e.engine).collect(retry),/budget_exhausted/);assert.equal(e.counts().creates,1);
});
test('Final engine pre-start gate rejects a release revoked after engine inspection',async()=>{
 const f=await fixture(),digest=await renderRelease(),lease=await child(f,digest),e=fixtureEngine(async()=>{await registry.change(digest,'revoked','during trusted engine pre-start inspection');});
 const result=await new OfflineRenderFixtureProducer(worker,lane,supervisor,e.engine).collect(lease);assert.equal(result.state,'failed');assert.equal(result.evidenceAccepted,false);assert.deepEqual(e.counts(),{creates:1,starts:0,cleanups:1});
});
test('Final metadata gate catches changed Site scope and stale robots without artifact I/O',async()=>{
 for(const change of ['site','robots']){
  const f=await fixture(),lease=await child(f,await renderRelease()),prepared=await worker.prepareOfflineRenderExecution(lease);
  const metadataOnly=new Jobs(scheduler,deletions,{read:async()=>{throw new Error('unexpected_artifact_read');}});
  await metadataOnly.assertOfflineRenderExecution(lease,prepared.descriptor);
  // Owner-only fault injection models independently changed persisted context.
  const c=await admin.connect();try{await c.query('BEGIN');await c.query("SET LOCAL session_replication_role='replica'");
   if(change==='site')await c.query("UPDATE aios.site SET normalized_origin='https://changed.example',submitted_url='https://changed.example/' WHERE id=$1",[f.site]);
   else await c.query("UPDATE aios.observation SET observed_at=clock_timestamp()-interval '25 hours',fresh_until=clock_timestamp()+interval '1 hour' WHERE id=$1",[f.robots.observationId]);
   await c.query('COMMIT');
  }finally{c.release();}
  await assert.rejects(metadataOnly.assertOfflineRenderExecution(lease,prepared.descriptor),/source_context_changed|robots_unavailable|scope_receipt_invalid/);
 }
});
test('Uncertain cleanup cannot issue a terminal witness or free occupied render capacity',async()=>{
 const f=await fixture(),lease=await child(f,await renderRelease()),e=fixtureEngine();e.engine.cleanup=async()=>{throw new Error('container_state_uncertain');};
 await assert.rejects(new OfflineRenderFixtureProducer(worker,lane,supervisor,e.engine).collect(lease),/container_state_uncertain/);
 const rows=(await admin.query('SELECT r.settled_at,t.receipt_id FROM aios.render_reservation r LEFT JOIN aios.render_terminal_receipt t USING(tenant_id,reservation_id) WHERE r.job_id=$1',[lease.jobId])).rows;assert.equal(rows.length,1);assert.equal(rows[0].settled_at,null);assert.equal(rows[0].receipt_id,null);
});
if(process.env.AIOS_TEST_RENDER_EXECUTION==='1')test('Real governed local Docker replay confirms cleanup and terminal accounting without accepting evidence',async()=>{
 const prefix=process.env.AIOS_DOCKER_CONTEXT?['--context',process.env.AIOS_DOCKER_CONTEXT]:[];
 const imageDigest=execFileSync('docker',[...prefix,'image','inspect','aios-seo-render-fixture','--format','{{.Id}}'],{encoding:'utf8'}).trim().replace(/^sha256:/,'');
 const browserBuild=execFileSync('docker',[...prefix,'run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node','sha256:'+imageDigest,'--input-type=module','-e',"import{readFileSync}from'node:fs';const b=JSON.parse(readFileSync('node_modules/playwright-core/browsers.json'));process.stdout.write(b.browsers.find(x=>x.name==='chromium').browserVersion)"],{encoding:'utf8',timeout:30000}).trim();
 const engine=new DockerOfflineRenderEngine({imageDigest,browserBuild,...(process.env.AIOS_DOCKER_CONTEXT?{dockerContext:process.env.AIOS_DOCKER_CONTEXT}:{})}),f=await fixture(),lease=await child(f,await renderRelease()),before=await evidenceCounts();
 const result=await new OfflineRenderFixtureProducer(worker,lane,supervisor,engine).collect(lease);assert.equal(result.state,'executed');assert.equal(result.conformance,'valid');assert.equal(result.evidenceAccepted,false);assert.deepEqual(await evidenceCounts(),before);
 const inspect=spawnSync('docker',[...prefix,'container','inspect',result.containerId],{encoding:'utf8'});assert.notEqual(inspect.status,0);assert.match(inspect.stderr,/No such (container|object)/i);
 const receipt=(await admin.query('SELECT actual_requests,actual_bytes FROM aios.render_terminal_receipt WHERE receipt_id=$1',[result.terminalReceiptId])).rows[0];assert.equal(receipt.actual_requests,null);assert.equal(receipt.actual_bytes,null);
});
