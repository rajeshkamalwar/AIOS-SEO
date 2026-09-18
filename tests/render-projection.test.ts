import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {readFile,writeFile,unlink} from 'node:fs/promises';
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
import {canonical,manifestHash,hash,validate,base} from '../packages/contracts/index.js';
import {RenderLane} from '../packages/jobs/render-lane.js';
import {RenderSupervisor} from '../packages/jobs/render-supervisor.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_render_projection_test'};
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool,supervisorPool:pg.Pool,acceptorPool:pg.Pool;
let blobs:LocalBlobs,ledger:Ledger,deletions:DeletionLedger,jobs:Jobs,worker:Jobs,registry:Registry,lane:RenderLane,supervisor:RenderSupervisor;
const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID(),author=randomUUID();
function connect(){admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_render_supervisor'});acceptorPool=new pg.Pool({...cfg,user:'aios_render_acceptor'});}
function services(){ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions,blobs,acceptorPool);registry=new Registry(operator);lane=new RenderLane(scheduler,deletions);supervisor=new RenderSupervisor(supervisorPool);}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_render_projection_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator','aios_render_supervisor','aios_render_acceptor'])await admin.query(`ALTER ROLE ${role} LOGIN`);await admin.end();connect();
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'render-projection-blobs'),'local-synthetic-v1');deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'render-projection-deletions'));services();
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");await admin.query('INSERT INTO control.authority_key VALUES($1,$2,true)',[reviewer,keys.publicKey.export({type:'spki',format:'pem'})]);
});
afterEach(async()=>{
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");
 await admin.query("UPDATE aios.membership SET state='active'");
 await admin.query("UPDATE aios.crawl SET state='cancelled' WHERE state IN ('queued','running','blocked')");
 await admin.query("UPDATE aios.job SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE state IN ('queued','leased','retry_wait')");
});
after(async()=>{for(const pool of [runtime,scheduler,operator,supervisorPool,acceptorPool,admin])await pool?.end();});
async function fixture(pages=20,requests=2000,html='<title>Fixture render</title>'){
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
 const raw=await observe('',html,'text/html');evidence.push(raw.receiptEvidenceId,raw.bodyEvidenceId!);observations.push(raw.observationId);
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
async function evidenceCounts(){return(await admin.query('SELECT (SELECT count(*) FROM aios.evidence) AS evidence,(SELECT count(*) FROM aios.observation) AS observations,(SELECT count(*) FROM aios.render_snapshot) AS renders,(SELECT count(*) FROM aios.outbox) AS events')).rows[0];}

const browserBuild='145.0.1.2',imageDigest='1'.repeat(64);
const privateDom='<html><head><title>Useful fixture</title></head><body><main>Public business text</main><form><input value="FORM_SENTINEL"><textarea>TEXTAREA_SENTINEL</textarea></form><input form="outside" value="OUTSIDE_SENTINEL"><script>const secret="SCRIPT_SENTINEL";</script><a href="https://outside.example/?token=URL_SENTINEL">safe label</a></body></html>';
/** Independent trusted fixture engine; these tests do not claim Docker execution. */
function engineFixture(mode:'partial'|'full'|'failed'|'timeout'|'invalid'='partial'){
 let stdout=Buffer.alloc(0);
 const engine:OfflineRenderEngine={browserBuild,async create(){return{id:manifestHash({fixture:randomUUID()}),imageDigest};},async start(_container,input,options){
  await options.beforeStart();const observedAt=new Date().toISOString();
  const samples=[{offsetMs:0,actualOffsetMs:0,observedAt,pendingRequests:2,dom:privateDom}];
  if(mode==='full'){for(const offsetMs of [2000,5000]){
   // Timers may wake early; report measured sample times only after the target.
   const target=Date.parse(observedAt)+offsetMs;
   while(Date.now()<target)await new Promise(resolve=>setTimeout(resolve,Math.max(1,target-Date.now())));
   const sampledAt=Date.now();
   samples.push({offsetMs,actualOffsetMs:sampledAt-Date.parse(observedAt),observedAt:new Date(sampledAt).toISOString(),pendingRequests:offsetMs===2000?1:0,dom:privateDom});
  }}
  const result=['partial','full'].includes(mode)?{profile:'local-offline-replay-v3',url:input.url,inputSha256:hash(Buffer.from(input.html)),browserBuild,state:'policy_limited',samples,deniedCount:1,deniedRequests:[{url:'https://outside.example/?api_key=DENIED_SENTINEL',method:'POST',resourceType:'fetch',reason:'offline_policy',observedAt}],sandbox:{namespace:true,pid:true,network:true,seccomp:true}}:{profile:'local-offline-replay-v3',url:null,inputSha256:null,browserBuild:null,state:mode,error:mode==='timeout'?'timeout':'render_failed',samples:[],deniedCount:0,deniedRequests:[],sandbox:null};
  stdout=mode==='invalid'?Buffer.from('invalid output'):Buffer.from(JSON.stringify(result));return{state:'exited',stdout};
 },async cleanup(){return{finishedAt:new Date().toISOString(),termination:'exited',exitCode:0};}};
 return{engine,stdout:()=>stdout};
}
async function executed(mode:'partial'|'full'|'failed'|'timeout'|'invalid'='partial'){
 const f=await fixture(),digest=await renderRelease(),lease=await child(f,digest),e=engineFixture(mode);
 const receipt=await new OfflineRenderFixtureProducer(worker,lane,supervisor,e.engine).collect(lease);
 assert.equal(receipt.conformance,mode==='invalid'?'invalid':'valid');
 return {...f,renderDigest:digest,renderLease:lease,receipt,stdout:e.stdout(),browserBuild,imageDigest};
}
const input=(f:Awaited<ReturnType<typeof executed>>)=>({stdout:f.stdout,receipt:f.receipt,browserBuild:f.browserBuild,imageDigest:f.imageDigest});
async function accepted(mode:'partial'|'full'|'failed'|'timeout'='partial'){
 const f=await executed(mode),acceptance=await worker.acceptOfflineRenderFixture(f.renderLease,input(f));return{...f,acceptance};
}
async function counts(){return(await admin.query('SELECT (SELECT count(*) FROM aios.render_snapshot) AS renders,(SELECT count(*) FROM aios.resource_observation) AS resources,(SELECT count(*) FROM aios.outbox) AS events,(SELECT count(*) FROM aios.evidence) AS evidence')).rows[0];}
async function job(id:string){return(await admin.query('SELECT * FROM aios.job WHERE job_id=$1',[id])).rows[0];}

test('Three accepted privacy-limited samples project exact timing and pending counts then atomically complete the render job',async()=>{
 const f=await accepted('full'),before=await counts(),cutoff=await ledger.cutoff(f.p,f.site),result=await worker.projectOfflineRenderFixture(f.renderLease,f.acceptance.observationId);
 assert.equal(result.invocationId,f.receipt.invocationId);assert.equal(result.observationId,f.acceptance.observationId);assert.equal(result.result,'partial');assert.equal(result.renderSnapshotIds.length,3);
 const rows=(await admin.query('SELECT * FROM aios.render_snapshot WHERE id=ANY($1::uuid[]) ORDER BY sample_offset_ms',[result.renderSnapshotIds])).rows;
 assert.equal(new Set(rows.map(r=>r.series_id)).size,3);assert.ok(rows.every(r=>Number(r.knowledge_seq)>cutoff.known_seq&&Number(r.version)===1&&r.superseded_seq===null));
 const wire=JSON.parse(f.stdout.toString()),context=(await admin.query('SELECT sha256 FROM aios.evidence WHERE id=$1',[f.acceptance.receiptEvidenceId])).rows[0].sha256;
 for(let i=0;i<3;i++){const row=rows[i],sample=wire.samples[i];assert.equal(row.state,'policy_limited');assert.equal(row.page_snapshot_id,f.snapshot);assert.equal(row.observation_id,f.acceptance.observationId);assert.equal(row.evidence_id,f.acceptance.domEvidenceIds[i]);assert.equal(Number(row.sample_offset_ms),sample.offsetMs);assert.equal(Number(row.pending_requests),sample.pendingRequests);assert.equal(new Date(row.observed_at).toISOString(),sample.observedAt);assert.equal(row.context_hash,context);assert.equal(row.critical_text_hash,null);assert.equal(row.browser_build,browserBuild);const record=JSON.parse(JSON.stringify(row));for(const key of ['schema_version','version','sample_offset_ms','pending_requests','knowledge_seq'])record[key]=Number(record[key]);if(record.superseded_seq!==null)record.superseded_seq=Number(record.superseded_seq);record.provenance_ids=(await admin.query("SELECT target_id FROM aios.record_link WHERE owner_id=$1 AND field_name='provenance_ids' ORDER BY ordinal",[row.id])).rows.map(r=>r.target_id);validate(base+'domain.schema.json#/$defs/RenderSnapshot',record);}
 const completed=await job(f.renderLease.jobId);assert.equal(completed.state,'completed');assert.equal(completed.result_ref,f.acceptance.observationId);assert.equal(completed.lease_token,null);assert.equal(completed.lease_until,null);
 const events=(await admin.query("SELECT payload FROM aios.outbox WHERE tenant_id=$1 AND event_type IN ('render.completed','job.completed') AND payload->>'correlation_id'=$2 ORDER BY recorded_at,event_type",[f.p.tenantId,f.run])).rows.map(r=>r.payload);
 const rendered=events.filter(e=>e.event_type==='render.completed'),finished=events.filter(e=>e.event_type==='job.completed'&&e.payload.job_id===f.renderLease.jobId);assert.equal(rendered.length,1);assert.equal(finished.length,1);for(const event of [...rendered,...finished])validate(base+'event.schema.json',event);
 assert.deepEqual([...rendered[0].payload.render_snapshot_ids].sort(),[...result.renderSnapshotIds].sort());assert.equal(rendered[0].payload.result,'partial');assert.equal(finished[0].payload.result_ref,f.acceptance.observationId);
 const after=await counts();assert.equal(Number(after.renders),Number(before.renders)+3);assert.equal(after.resources,before.resources);assert.equal(after.evidence,before.evidence);
 assert.deepEqual(await worker.projectOfflineRenderFixture(f.renderLease,f.acceptance.observationId),result);assert.deepEqual(await counts(),after);
});

test('Accepted before-DOM failures complete as failed observations without fabricated snapshots',async()=>{
 for(const mode of ['failed','timeout'] as const){const f=await accepted(mode),before=await counts(),result=await worker.projectOfflineRenderFixture(f.renderLease,f.acceptance.observationId);assert.equal(result.result,'failed');assert.deepEqual(result.renderSnapshotIds,[]);const after=await counts();assert.equal(after.renders,before.renders);assert.equal(after.resources,before.resources);assert.equal((await job(f.renderLease.jobId)).state,'completed');}
});

test('Projection requires exact accepted observation, source scope and original attempt proof',async()=>{
 const f=await accepted(),other=await accepted(),before=await counts();
 await assert.rejects(worker.projectOfflineRenderFixture(f.renderLease,randomUUID()),/snapshot_unavailable|invalid_receipt/);
 await assert.rejects(worker.projectOfflineRenderFixture(f.renderLease,other.acceptance.observationId),/scope|snapshot_unavailable|invalid_receipt/);
 for(const changed of [{token:randomUUID()},{attemptId:randomUUID()},{tenantId:other.p.tenantId,siteId:other.site,runId:other.run}])await assert.rejects(worker.projectOfflineRenderFixture({...f.renderLease,...changed},f.acceptance.observationId),/scope|lease|fenced|invalid|handler_not_installed/);
 await assert.rejects(worker.projectOfflineRenderFixture(f.lease,f.acceptance.observationId),/handler_not_installed|lease|invalid_receipt/);assert.deepEqual(await counts(),before);
});

test('Scheduler cannot bypass typed validation with raw RenderSnapshot insertion or generic job completion',async()=>{
 const f=await accepted(),before=await counts();await assert.rejects(worker.complete(f.renderLease,f.bundle),/handler_not_installed/);
 const receipt=(await admin.query('SELECT * FROM aios.evidence WHERE id=$1',[f.acceptance.receiptEvidenceId])).rows[0];const altered=JSON.parse((await blobs.read(receipt.artifact_key,receipt.sha256,Number(receipt.bytes))).toString());altered.worker.samples[0].pendingRequests=99;
 await assert.rejects(scheduler.query('SELECT * FROM control.project_offline_render_fixture($1,$2,$3,$4,$5,$6,$7,$8,$9)',[f.p.tenantId,f.site,f.run,f.renderLease.jobId,f.renderLease.attempt,f.renderLease.attemptId,f.renderLease.token,f.acceptance.observationId,JSON.stringify(altered)]),/artifact_integrity_failed/);
 const c=await scheduler.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.p.tenantId]);await assert.rejects(c.query('INSERT INTO aios.render_snapshot DEFAULT VALUES'),/permission denied/);await c.query('ROLLBACK');await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.p.tenantId]);
 await assert.rejects(async()=>{await c.query("UPDATE aios.job SET state='completed',lease_token=NULL,lease_until=NULL,result_ref=$2 WHERE job_id=$1",[f.renderLease.jobId,f.acceptance.observationId]);await c.query('COMMIT');},/handler_not_installed|projection_required|invalid_receipt/);
 }finally{await c.query('ROLLBACK');c.release();}assert.deepEqual(await counts(),before);assert.equal((await job(f.renderLease.jobId)).state,'leased');
});

test('Current release, cancellation and deletion fences block projection after evidence acceptance',async()=>{
 for(const gate of ['revoke','cancel','delete']){const f=await accepted(),before=await counts();if(gate==='revoke')await registry.change(f.renderDigest,'revoked','after artifact acceptance');else if(gate==='cancel')await jobs.cancel(f.p,f.site,f.run);else await deletions.record(f.p.tenantId,f.site);await assert.rejects(worker.projectOfflineRenderFixture(f.renderLease,f.acceptance.observationId),/skill_revoked|run_fenced|deleted_scope/);assert.deepEqual(await counts(),before);}
});

test('Source mutation and independent rejection of accepted evidence prevent projection',async()=>{
 const changed=await accepted(),before=await counts();await admin.query('UPDATE aios.site SET version=version+1 WHERE id=$1',[changed.site]);await assert.rejects(worker.projectOfflineRenderFixture(changed.renderLease,changed.acceptance.observationId),/source_context_changed|scope_receipt_invalid/);assert.deepEqual(await counts(),before);
 const f=await accepted(),beforeAudit=await counts();await admin.query('ALTER ROLE aios_evaluator LOGIN');const evaluator=new pg.Pool({...cfg,user:'aios_evaluator'});
 try{await transaction(evaluator,'aios_evaluator',async c=>{await scope(c,f.p,f.site);const time=await tick(c,f.p.tenantId),id=randomUUID();const row={record_type:'SelfAuditResult',id,schema_version:2,version:1,created_at:time.recorded_at,recorded_at:time.recorded_at,updated_at:time.recorded_at,deleted_at:null,state:'recorded',retention_class:'audit',tenant_id:f.p.tenantId,site_id:f.site,crawl_id:f.run,check_id:'A02',check_version:'1.1.0',result:'fail',effect:'reject_outputs',reason:'independent fixture rejection',knowledge_seq:time.knowledge_seq,scope:'outputs',scope_complete:true,dependency_snapshot_hash:'0'.repeat(64),recovery_of_id:null};const fields=Object.entries(row);await c.query(`INSERT INTO self_audit_result (${fields.map(([k])=>k).join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(([,v])=>v));await c.query('INSERT INTO audit_impact VALUES($1,$2,$3,$4,true)',[f.p.tenantId,f.site,id,f.acceptance.domEvidenceIds[0]]);});}finally{await evaluator.end();}
 await assert.rejects(worker.projectOfflineRenderFixture(f.renderLease,f.acceptance.observationId),/audit_input_rejected/);assert.deepEqual(await counts(),beforeAudit);
});

test('Corrupted manifest and missing retained DOM cannot produce snapshots or completion',async()=>{
 for(const which of ['manifest','dom']){const f=await accepted(),before=await counts(),id=which==='manifest'?f.acceptance.receiptEvidenceId:f.acceptance.domEvidenceIds[0],row=(await admin.query('SELECT artifact_key FROM aios.evidence WHERE id=$1',[id])).rows[0];const path=join(process.env.AIOS_TEST_ROOT!,'render-projection-blobs',row.artifact_key.replaceAll('/','_'));if(which==='manifest')await writeFile(path,'corrupted retained manifest');else await unlink(path);await assert.rejects(worker.projectOfflineRenderFixture(f.renderLease,f.acceptance.observationId),/artifact_integrity_failed|ENOENT|source_unavailable/);assert.deepEqual(await counts(),before);assert.equal((await job(f.renderLease.jobId)).state,'leased');}
});

test('Failure of the second completion event rolls back snapshots, the first event and job state together',async()=>{
 const f=await accepted(),before=await counts();await admin.query("CREATE FUNCTION aios.test_projection_outbox_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected_projection_outbox_failure'; END$$");await admin.query("CREATE TRIGGER test_projection_outbox_failure BEFORE INSERT ON aios.outbox FOR EACH ROW WHEN(NEW.event_type='job.completed') EXECUTE FUNCTION aios.test_projection_outbox_failure()");
 try{await assert.rejects(worker.projectOfflineRenderFixture(f.renderLease,f.acceptance.observationId),/injected_projection_outbox_failure/);assert.deepEqual(await counts(),before);assert.equal((await job(f.renderLease.jobId)).state,'leased');}finally{await admin.query('DROP TRIGGER test_projection_outbox_failure ON aios.outbox');await admin.query('DROP FUNCTION aios.test_projection_outbox_failure()');}
 const result=await worker.projectOfflineRenderFixture(f.renderLease,f.acceptance.observationId);assert.equal(result.renderSnapshotIds.length,1);
});

test('Completed replay retains exact historical IDs across restart and still rechecks current revocation',async()=>{
 const f=await accepted(),result=await worker.projectOfflineRenderFixture(f.renderLease,f.acceptance.observationId),before=await counts();
 await Promise.all([runtime.end(),scheduler.end(),operator.end(),supervisorPool.end(),acceptorPool.end(),admin.end()]);execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',process.env.AIOS_TEST_DATA!,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart'],{stdio:'pipe'});connect();services();
 assert.deepEqual(await worker.projectOfflineRenderFixture(f.renderLease,f.acceptance.observationId),result);assert.deepEqual(await counts(),before);
 await assert.rejects(worker.projectOfflineRenderFixture({...f.renderLease,token:randomUUID()},f.acceptance.observationId),/lease|invalid_receipt/);await registry.change(f.renderDigest,'revoked','after completed projection');await assert.rejects(worker.projectOfflineRenderFixture(f.renderLease,f.acceptance.observationId),/skill_revoked/);assert.deepEqual(await counts(),before);
});

if(process.env.AIOS_TEST_RENDER_PROJECTION==='1')test('Actual governed Docker path retains private artifacts and commits typed samples with atomic job completion',async()=>{
 const prefix=process.env.AIOS_DOCKER_CONTEXT?['--context',process.env.AIOS_DOCKER_CONTEXT]:[],imageDigest=execFileSync('docker',[...prefix,'image','inspect','aios-seo-render-fixture','--format','{{.Id}}'],{encoding:'utf8'}).trim().replace(/^sha256:/,'');
 const browserBuild=execFileSync('docker',[...prefix,'run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node','sha256:'+imageDigest,'--input-type=module','-e',"import{readFileSync}from'node:fs';const b=JSON.parse(readFileSync('node_modules/playwright-core/browsers.json'));process.stdout.write(b.browsers.find(x=>x.name==='chromium').browserVersion)"],{encoding:'utf8',timeout:30000}).trim();
 const engine=new DockerOfflineRenderEngine({imageDigest,browserBuild,...(process.env.AIOS_DOCKER_CONTEXT?{dockerContext:process.env.AIOS_DOCKER_CONTEXT}:{})}),f=await fixture(20,2000,privateDom),lease=await child(f,await renderRelease());
 const result=await new OfflineRenderFixtureProducer(worker,lane,supervisor,engine).collectAcceptAndProject(lease);assert.equal(result.execution.state,'executed');assert.equal(result.projection.renderSnapshotIds.length,3);assert.equal(result.projection.result,'partial');assert.equal((await job(lease.jobId)).state,'completed');
 for(const id of [result.acceptance.receiptEvidenceId,...result.acceptance.domEvidenceIds]){const row=(await admin.query('SELECT * FROM aios.evidence WHERE id=$1',[id])).rows[0],bytes=await blobs.read(row.artifact_key,row.sha256,Number(row.bytes));for(const sentinel of ['FORM_SENTINEL','TEXTAREA_SENTINEL','OUTSIDE_SENTINEL','SCRIPT_SENTINEL','URL_SENTINEL'])assert.equal(bytes.toString().includes(sentinel),false);}
 const inspection=spawnSync('docker',[...prefix,'container','inspect',result.execution.containerId],{encoding:'utf8'});assert.notEqual(inspection.status,0);assert.match(inspection.stderr,/No such (container|object)/i);assert.deepEqual(await worker.projectOfflineRenderFixture(lease,result.acceptance.observationId),result.projection);
});

test('Projection holds no work lock during artifact reads and rechecks cancellation before committing',async()=>{
 const f=await accepted(),before=await counts();let checked=false;
 const interrupted=new Jobs(scheduler,deletions,{read:async(key,digest,size)=>{
  const bytes=await blobs.read(key,digest,size);if(!checked){checked=true;const c=await admin.connect();try{await c.query('BEGIN');assert.equal((await c.query('SELECT pg_try_advisory_xact_lock(68273433) AS acquired')).rows[0].acquired,true);}finally{await c.query('ROLLBACK');c.release();}await jobs.cancel(f.p,f.site,f.run);}return bytes;
 }});
 await assert.rejects(interrupted.projectOfflineRenderFixture(f.renderLease,f.acceptance.observationId),/run_fenced/);assert.equal(checked,true);assert.deepEqual(await counts(),before);
});
