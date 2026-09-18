import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
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
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_render_acceptance_test'};
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool,supervisorPool:pg.Pool,acceptorPool:pg.Pool;
let blobs:LocalBlobs,ledger:Ledger,deletions:DeletionLedger,jobs:Jobs,worker:Jobs,registry:Registry,lane:RenderLane,supervisor:RenderSupervisor;
const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID(),author=randomUUID();
function connect(){admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_render_supervisor'});acceptorPool=new pg.Pool({...cfg,user:'aios_render_acceptor'});}
function services(){ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions,blobs,acceptorPool);registry=new Registry(operator);lane=new RenderLane(scheduler,deletions);supervisor=new RenderSupervisor(supervisorPool);}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_render_acceptance_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator','aios_render_supervisor','aios_render_acceptor'])await admin.query(`ALTER ROLE ${role} LOGIN`);await admin.end();connect();
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'render-acceptance-blobs'),'local-synthetic-v1');deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'render-acceptance-deletions'));services();
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
const reviewedRawDom='<html><head><title>Useful fixture</title></head><body><main>Public business text</main><form><input value=""><textarea></textarea></form><input form="outside" value=""><a href="https://outside.example/">safe label</a></body></html>';
const privateDom='<html><head><title>Useful fixture</title></head><body><main>Public business text</main><form><input value="FORM_SENTINEL"><textarea>TEXTAREA_SENTINEL</textarea></form><input form="outside" value="OUTSIDE_SENTINEL"><script>const secret="SCRIPT_SENTINEL";</script><a href="https://outside.example/?token=URL_SENTINEL">safe label</a></body></html>';
/** Independent trusted fixture engine; these tests do not claim Docker execution. */
function engineFixture(mode:'partial'|'failed'|'timeout'|'invalid'='partial'){
 let stdout=Buffer.alloc(0);
 const engine:OfflineRenderEngine={browserBuild,async create(){return{id:manifestHash({fixture:randomUUID()}),imageDigest};},async start(_container,input,options){
  await options.beforeStart();const observedAt=new Date().toISOString();
  const result=mode==='partial'?{profile:'local-offline-replay-v3',url:input.url,inputSha256:hash(Buffer.from(input.html)),browserBuild,state:'policy_limited',samples:[{offsetMs:0,actualOffsetMs:0,observedAt,pendingRequests:0,dom:privateDom}],deniedCount:1,deniedRequests:[{url:'https://outside.example/?api_key=DENIED_SENTINEL',method:'POST',resourceType:'fetch',reason:'offline_policy',observedAt}],sandbox:{namespace:true,pid:true,network:true,seccomp:true}}:{profile:'local-offline-replay-v3',url:null,inputSha256:null,browserBuild:null,state:mode,error:mode==='timeout'?'timeout':'render_failed',samples:[],deniedCount:0,deniedRequests:[],sandbox:null};
  stdout=mode==='invalid'?Buffer.from('invalid output'):Buffer.from(JSON.stringify(result));return{state:'exited',stdout};
 },async cleanup(){return{finishedAt:new Date().toISOString(),termination:'exited',exitCode:0};}};
 return{engine,stdout:()=>stdout};
}
async function executed(mode:'partial'|'failed'|'timeout'|'invalid'='partial'){
 const f=await fixture(),digest=await renderRelease(),lease=await child(f,digest),e=engineFixture(mode);
 const receipt=await new OfflineRenderFixtureProducer(worker,lane,supervisor,e.engine).collect(lease);
 assert.equal(receipt.conformance,mode==='invalid'?'invalid':'valid');
 return {...f,renderDigest:digest,renderLease:lease,receipt,stdout:e.stdout(),browserBuild,imageDigest};
}
const input=(f:Awaited<ReturnType<typeof executed>>)=>({stdout:f.stdout,receipt:f.receipt,browserBuild:f.browserBuild,imageDigest:f.imageDigest});
async function acceptedBlobs(beforeIds:string[]){
 const rows=(await admin.query('SELECT * FROM aios.evidence WHERE NOT(id=ANY($1::uuid[])) ORDER BY id',[beforeIds])).rows;
 return Promise.all(rows.map(async row=>({row,bytes:await blobs.read(row.artifact_key,row.sha256,Number(row.bytes))})));
}

test('Accepted offline replay retains only transformed private artifacts and creates no render projection or completion',async()=>{
 const f=await executed(),before=await evidenceCounts(),beforeIds=(await admin.query('SELECT id FROM aios.evidence')).rows.map(r=>r.id);
 const accepted=await worker.acceptOfflineRenderFixture(f.renderLease,input(f));
 assert.equal(accepted.invocationId,f.receipt.invocationId);assert.equal(accepted.domEvidenceIds.length,1);
 const observation=(await admin.query('SELECT * FROM aios.observation WHERE id=$1',[accepted.observationId])).rows[0];assert.equal(observation.subject_id,f.snapshot);assert.equal(observation.sensor_id,'offline-render-fixture');assert.equal(observation.state,'partial');
 const event=(await admin.query('SELECT payload FROM aios.outbox WHERE aggregate_id=$1',[accepted.observationId])).rows[0].payload;validate(base+'event.schema.json',event);assert.equal(event.event_type,'evidence.recorded');assert.equal(event.payload.evidence_id,accepted.receiptEvidenceId);
 const stored=await acceptedBlobs(beforeIds);assert.equal(stored.length,2);
 for(const {row,bytes} of stored){assert.equal(hash(bytes),row.sha256);assert.equal(row.redaction_version==='none-v1',false);
  for(const sentinel of ['FORM_SENTINEL','TEXTAREA_SENTINEL','OUTSIDE_SENTINEL','SCRIPT_SENTINEL','URL_SENTINEL','DENIED_SENTINEL'])assert.equal(bytes.toString().includes(sentinel),false,sentinel+' must not be retained');
 }
 assert.ok(stored.some(x=>x.bytes.toString().includes('Public business text')));
 const after=await evidenceCounts();assert.equal(Number(after.evidence),Number(before.evidence)+2);assert.equal(Number(after.observations),Number(before.observations)+1);assert.equal(after.renders,before.renders);assert.ok(Number(after.events)>Number(before.events));
 const job=(await admin.query('SELECT state,result_ref FROM aios.job WHERE job_id=$1',[f.renderLease.jobId])).rows[0];assert.notEqual(job.state,'completed');assert.equal(job.result_ref,null);
 const filesBefore=await readdir(join(process.env.AIOS_TEST_ROOT!,'render-acceptance-blobs'));
 assert.deepEqual(await worker.acceptOfflineRenderFixture(f.renderLease,input(f)),accepted);assert.deepEqual(await evidenceCounts(),after);assert.deepEqual(await readdir(join(process.env.AIOS_TEST_ROOT!,'render-acceptance-blobs')),filesBefore);
 await assert.rejects(worker.acceptOfflineRenderFixture(f.renderLease,{...input(f),stdout:Buffer.concat([f.stdout,Buffer.from(' ')])}),/invalid|conflict/);
});

test('Render acceptance rejects forged terminal identity, changed stdout, image/build and cross-scope leases',async()=>{
 const f=await executed(),other=await fixture(),before=await evidenceCounts();
 for(const bad of [
  {...input(f),receipt:{...f.receipt,terminalReceiptId:randomUUID()}},
  {...input(f),receipt:{...f.receipt,invocationId:randomUUID()}},
  {...input(f),stdout:Buffer.concat([f.stdout,Buffer.from(' ')])},
  {...input(f),imageDigest:'2'.repeat(64)},
  {...input(f),browserBuild:'999.1.2.3'},
 ])await assert.rejects(worker.acceptOfflineRenderFixture(f.renderLease,bad),/invalid|integrity|context|receipt|conflict/);
 await assert.rejects(worker.acceptOfflineRenderFixture({...f.renderLease,tenantId:other.p.tenantId,siteId:other.site,runId:other.run},input(f)),/scope|lease|fenced|invalid/);
 assert.deepEqual(await evidenceCounts(),before);
});

test('Current revocation, cancellation and independent deletion still fence acceptance after proven terminal accounting',async()=>{
 for(const gate of ['revoke','cancel','delete']){
  const f=await executed(),before=await evidenceCounts();
  if(gate==='revoke')await registry.change(f.renderDigest,'revoked','after terminal');else if(gate==='cancel')await jobs.cancel(f.p,f.site,f.run);else await deletions.record(f.p.tenantId,f.site);
  await assert.rejects(worker.acceptOfflineRenderFixture(f.renderLease,input(f)),/skill_revoked|run_fenced|deleted_scope/);assert.deepEqual(await evidenceCounts(),before);
 }
});

test('Changed current Site context cannot be accepted after terminal recording',async()=>{
 const f=await executed(),before=await evidenceCounts();
 await admin.query('UPDATE aios.site SET version=version+1 WHERE id=$1',[f.site]);
 await assert.rejects(worker.acceptOfflineRenderFixture(f.renderLease,input(f)),/source_context_changed|scope_receipt_invalid/);assert.deepEqual(await evidenceCounts(),before);
});

test('Conforming before-DOM failure and timeout retain only a failure observation, never invented DOM',async()=>{
 for(const mode of ['failed','timeout'] as const){
  const f=await executed(mode),before=await evidenceCounts(),accepted=await worker.acceptOfflineRenderFixture(f.renderLease,input(f));assert.equal(accepted.domEvidenceIds.length,0);
  const after=await evidenceCounts();assert.equal(Number(after.evidence),Number(before.evidence)+1);assert.equal(Number(after.observations),Number(before.observations)+1);assert.equal(after.renders,before.renders);
 }
 const invalid=await executed('invalid'),before=await evidenceCounts();await assert.rejects(worker.acceptOfflineRenderFixture(invalid.renderLease,input(invalid)),/invalid|conformance|receipt/);assert.deepEqual(await evidenceCounts(),before);
});

test('Outbox failure rolls back accepted evidence, observation and invocation mapping before a safe retry',async()=>{
 const f=await executed(),before=await evidenceCounts();
 await admin.query("CREATE FUNCTION aios.test_render_outbox_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected_outbox_failure'; END$$");
 await admin.query('CREATE TRIGGER test_render_outbox_failure BEFORE INSERT ON aios.outbox FOR EACH ROW EXECUTE FUNCTION aios.test_render_outbox_failure()');
 try{await assert.rejects(worker.acceptOfflineRenderFixture(f.renderLease,input(f)),/injected_outbox_failure/);assert.deepEqual(await evidenceCounts(),before);}finally{await admin.query('DROP TRIGGER test_render_outbox_failure ON aios.outbox');await admin.query('DROP FUNCTION aios.test_render_outbox_failure()');}
 const result=await worker.acceptOfflineRenderFixture(f.renderLease,input(f));assert.ok(result.observationId);assert.deepEqual(await worker.acceptOfflineRenderFixture(f.renderLease,input(f)),result);
});

test('Producer private handoff accepts its exact transcript without exposing raw DOM in operational execution receipt',async()=>{
 const f=await fixture(),lease=await child(f,await renderRelease()),e=engineFixture();
 const result=await new OfflineRenderFixtureProducer(worker,lane,supervisor,e.engine).collectAndAccept(lease);
 assert.equal(result.execution.evidenceAccepted,false);assert.equal(result.acceptance.invocationId,result.execution.invocationId);assert.equal(result.acceptance.domEvidenceIds.length,1);assert.equal(JSON.stringify(result.execution).includes('FORM_SENTINEL'),false);
});

test('Independent source rejection after termination blocks artifact acceptance',async()=>{
 const f=await executed(),before=await evidenceCounts();await admin.query('ALTER ROLE aios_evaluator LOGIN');const evaluator=new pg.Pool({...cfg,user:'aios_evaluator'});
 try{await transaction(evaluator,'aios_evaluator',async c=>{await scope(c,f.p,f.site);const time=await tick(c,f.p.tenantId),id=randomUUID();
  const row={record_type:'SelfAuditResult',id,schema_version:2,version:1,created_at:time.recorded_at,recorded_at:time.recorded_at,updated_at:time.recorded_at,deleted_at:null,state:'recorded',retention_class:'audit',tenant_id:f.p.tenantId,site_id:f.site,crawl_id:f.run,check_id:'A02',check_version:'1.1.0',result:'fail',effect:'reject_outputs',reason:'independent fixture rejection',knowledge_seq:time.knowledge_seq,scope:'outputs',scope_complete:true,dependency_snapshot_hash:'0'.repeat(64),recovery_of_id:null};
  const fields=Object.entries(row);await c.query(`INSERT INTO self_audit_result (${fields.map(([k])=>k).join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(([,v])=>v));await c.query('INSERT INTO audit_impact VALUES($1,$2,$3,$4,true)',[f.p.tenantId,f.site,id,f.snapshot]);
 });}finally{await evaluator.end();}
 await assert.rejects(worker.acceptOfflineRenderFixture(f.renderLease,input(f)),/audit_input_rejected/);assert.deepEqual(await evidenceCounts(),before);
});

test('Cancellation during transformed blob upload prevents all domain acceptance',async()=>{
 const f=await executed(),before=await evidenceCounts();let cancelled=false;
 const interrupted=new Jobs(scheduler,deletions,{read:blobs.read.bind(blobs),key:blobs.key.bind(blobs),put:async(key,bytes)=>{await blobs.put(key,bytes);if(!cancelled){cancelled=true;await jobs.cancel(f.p,f.site,f.run);}}},acceptorPool);
 await assert.rejects(interrupted.acceptOfflineRenderFixture(f.renderLease,input(f)),/run_fenced/);assert.equal(cancelled,true);assert.deepEqual(await evidenceCounts(),before);
});

test('Concurrent identical accepted transcript produces one durable observation and shared result identities',async()=>{
 const f=await executed(),before=await evidenceCounts(),results=await Promise.all([worker.acceptOfflineRenderFixture(f.renderLease,input(f)),worker.acceptOfflineRenderFixture(f.renderLease,input(f))]);
 assert.deepEqual(results[0],results[1]);const after=await evidenceCounts();assert.equal(Number(after.evidence),Number(before.evidence)+2);assert.equal(Number(after.observations),Number(before.observations)+1);
});

test('Accepted transcript IDs and transformed artifact integrity survive immediate database restart',async()=>{
 const f=await executed(),result=await worker.acceptOfflineRenderFixture(f.renderLease,input(f)),before=await evidenceCounts();
 await Promise.all([runtime.end(),scheduler.end(),operator.end(),supervisorPool.end(),acceptorPool.end(),admin.end()]);
 execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',process.env.AIOS_TEST_DATA!,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart'],{stdio:'pipe'});connect();services();
 assert.deepEqual(await worker.acceptOfflineRenderFixture(f.renderLease,input(f)),result);assert.deepEqual(await evidenceCounts(),before);
 for(const id of [result.receiptEvidenceId,...result.domEvidenceIds]){const row=(await admin.query('SELECT * FROM aios.evidence WHERE id=$1',[id])).rows[0];const bytes=await blobs.read(row.artifact_key,row.sha256,Number(row.bytes));assert.equal(hash(bytes),row.sha256);}
});

test('Only the separate collection acceptor may write render evidence; it cannot reserve, bind or attest execution',async()=>{
 const args=[randomUUID(),randomUUID(),randomUUID(),randomUUID(),1,randomUUID(),randomUUID(),randomUUID(),randomUUID(),'0'.repeat(64),{}];
 for(const pool of [runtime,scheduler,operator,supervisorPool])await assert.rejects(pool.query('SELECT * FROM control.accept_offline_render_fixture($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',args),/permission denied|service_authority_required/);
 for(const name of ['reserve_render_accounting','bind_render_invocation','record_render_terminal','settle_render_terminal']){
  const row=(await admin.query("SELECT has_function_privilege('aios_render_acceptor',p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='control' AND p.proname=$1",[name])).rows[0];assert.equal(row.allowed,false,name);
 }
 for(const sql of ['UPDATE control.render_concurrency SET in_flight=0','INSERT INTO aios.render_terminal_receipt DEFAULT VALUES','INSERT INTO aios.evidence DEFAULT VALUES'])await assert.rejects(acceptorPool.query(sql),/permission denied/);
 const f=await executed(),before=await evidenceCounts();await assert.rejects(new Jobs(scheduler,deletions,blobs).acceptOfflineRenderFixture(f.renderLease,input(f)),/acceptor.*required|acceptance.*required|service_authority_required/);assert.deepEqual(await evidenceCounts(),before);
});

if(process.env.AIOS_TEST_RENDER_ACCEPTANCE==='1')test('Real governed Docker replay persists only privacy-transformed artifacts from its exact supervised transcript',async()=>{
 const prefix=process.env.AIOS_DOCKER_CONTEXT?['--context',process.env.AIOS_DOCKER_CONTEXT]:[];
 const imageDigest=execFileSync('docker',[...prefix,'image','inspect','aios-seo-render-fixture','--format','{{.Id}}'],{encoding:'utf8'}).trim().replace(/^sha256:/,'');
 const browserBuild=execFileSync('docker',[...prefix,'run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node','sha256:'+imageDigest,'--input-type=module','-e',"import{readFileSync}from'node:fs';const b=JSON.parse(readFileSync('node_modules/playwright-core/browsers.json'));process.stdout.write(b.browsers.find(x=>x.name==='chromium').browserVersion)"],{encoding:'utf8',timeout:30000}).trim();
 const engine=new DockerOfflineRenderEngine({imageDigest,browserBuild,...(process.env.AIOS_DOCKER_CONTEXT?{dockerContext:process.env.AIOS_DOCKER_CONTEXT}:{})});
 const f=await fixture(20,2000,reviewedRawDom),lease=await child(f,await renderRelease()),before=await evidenceCounts(),beforeIds=(await admin.query('SELECT id FROM aios.evidence')).rows.map(r=>r.id);
 const result=await new OfflineRenderFixtureProducer(worker,lane,supervisor,engine).collectAndAccept(lease);
 assert.equal(result.execution.state,'executed');assert.equal(result.execution.conformance,'valid');assert.equal(result.acceptance.domEvidenceIds.length,3);assert.equal(result.execution.evidenceAccepted,false);
 const stored=await acceptedBlobs(beforeIds);assert.equal(stored.length,4);
 for(const {bytes} of stored)assert.doesNotMatch(bytes.toString(),/<(?:form|input|textarea)\b/i);
 assert.ok(stored.some(x=>x.bytes.toString().includes('Public business text')));const after=await evidenceCounts();assert.equal(after.renders,before.renders);
 const inspection=spawnSync('docker',[...prefix,'container','inspect',result.execution.containerId],{encoding:'utf8'});assert.notEqual(inspection.status,0);assert.match(inspection.stderr,/No such (container|object)/i);
 const job=(await admin.query('SELECT state,result_ref FROM aios.job WHERE job_id=$1',[lease.jobId])).rows[0];assert.notEqual(job.state,'completed');assert.equal(job.result_ref,null);
});

test('Maintenance cannot acquire an orphan-sweep fence while transformed blobs await acceptance',async()=>{
 const f=await executed();let tested=false;
 const guarded=new Jobs(scheduler,deletions,{read:blobs.read.bind(blobs),key:blobs.key.bind(blobs),put:async(key,bytes)=>{
  await blobs.put(key,bytes);if(!tested){tested=true;const maintenance=await admin.connect();try{await maintenance.query('BEGIN');assert.equal((await maintenance.query('SELECT pg_try_advisory_xact_lock(68273431) AS acquired')).rows[0].acquired,false);}finally{await maintenance.query('ROLLBACK');maintenance.release();}}
 }},acceptorPool);
 const result=await guarded.acceptOfflineRenderFixture(f.renderLease,input(f));assert.equal(tested,true);
 for(const id of [result.receiptEvidenceId,...result.domEvidenceIds]){const row=(await admin.query('SELECT * FROM aios.evidence WHERE id=$1',[id])).rows[0];assert.equal(hash(await blobs.read(row.artifact_key,row.sha256,Number(row.bytes))),row.sha256);}
 const maintenance=await admin.connect();try{await maintenance.query('BEGIN');assert.equal((await maintenance.query('SELECT pg_try_advisory_xact_lock(68273431) AS acquired')).rows[0].acquired,true);}finally{await maintenance.query('ROLLBACK');maintenance.release();}
});
