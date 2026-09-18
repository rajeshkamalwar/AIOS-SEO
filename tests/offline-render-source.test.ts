import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {migrate} from '../packages/persistence/migrate.js';
import {Ledger,type Principal,type HttpFixtureResult} from '../packages/persistence/index.js';
import {LocalBlobs} from '../packages/evidence/index.js';
import {Registry} from '../packages/skills/index.js';
import {Jobs} from '../packages/jobs/index.js';
import {FixtureLinkFrontier} from '../packages/jobs/frontier-links.js';
import {FixtureFrontier} from '../packages/jobs/frontier.js';
import {DeletionLedger} from '../packages/policy/deletion.js';
import {canonical,manifestHash,hash} from '../packages/contracts/index.js';
import {transaction,scope,tick} from '../packages/persistence/transaction.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_offline_render_source_test'};
const p:Principal={tenantId:randomUUID(),userId:randomUUID()};
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool,evaluator:pg.Pool;
let ledger:Ledger,blobs:LocalBlobs,jobs:Jobs,worker:Jobs,registry:Registry,deletions:DeletionLedger;
const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID(),author=randomUUID();
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_offline_render_source_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator','aios_evaluator'])await admin.query(`ALTER ROLE ${role} LOGIN`);
 runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});evaluator=new pg.Pool({...cfg,user:'aios_evaluator'});
 for(const [type,table,changes] of [['Tenant','tenant',{id:p.tenantId}],['User','app_user',{id:p.userId,subject:p.userId}],['Membership','membership',{id:randomUUID(),tenant_id:p.tenantId,user_id:p.userId}]] as const){
  const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes},entries=Object.entries(row).filter(([k])=>!['provenance_ids','site_scope_ids'].includes(k));
  await admin.query(`INSERT INTO aios.${table} (${entries.map(([k])=>k).join(',')}) VALUES(${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));
 }
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'render-source-blobs'),'local-synthetic-v1');deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'render-source-deletions'));
 ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions,blobs);registry=new Registry(operator);
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");
 await admin.query('INSERT INTO control.authority_key VALUES($1,$2,true)',[reviewer,keys.publicKey.export({type:'spki',format:'pem'})]);
 for(const kind of ['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'])await admin.query('INSERT INTO control.tenant_cap VALUES($1,$2,10000)',[p.tenantId,kind]);
});
afterEach(async()=>{
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");
 await admin.query("UPDATE aios.membership SET state='active' WHERE tenant_id=$1",[p.tenantId]);
 // Owner cleanup only; tombstoned fixtures deliberately cannot use command authority.
 await admin.query("UPDATE aios.crawl SET state='cancelled' WHERE state IN ('queued','running','blocked')");
 await admin.query("UPDATE aios.job SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE state IN ('queued','leased','retry_wait')");
});
after(async()=>{for(const pool of [runtime,scheduler,operator,evaluator,admin])await pool?.end();});
async function release(){
 const manifest=JSON.parse(await readFile('spec/examples/skill-reliability-gate.json','utf8'));
 manifest.skill_id='seo.fixture-'+randomUUID().replace(/[0-9]/g,n=>String.fromCharCode(103+Number(n)));manifest.last_verified=new Date().toISOString();manifest.freshness_deadline=new Date(Date.now()+3600000).toISOString();
 const approval={author,reviewer,manifest_digest:manifestHash(manifest),evaluation_digest:manifestHash({fixture:true}),approved_at:new Date().toISOString(),scope:'local-synthetic-v1' as const,dependencies:[]};
 return registry.approve(manifest,approval,sign(null,Buffer.from(canonical(approval)),keys.privateKey).toString('base64'));
}
async function submit(site:string){return jobs.submit(p,site,randomUUID(),{http_requests:10,render_requests:0,render_pages:0,model_calls:0,tokens:0,cost_microusd:0,deadline:new Date(Date.now()+600000).toISOString()});}
async function setup(body=Buffer.from('<title>Retained fixture</title>'),contentType='text/html',changes:Partial<HttpFixtureResult>={},pagePath='',indexed=false){
 const url='https://'+randomUUID()+'.example/',site=await ledger.registerSite(p,url),run=await submit(site),digest=await release();
 const scopeReceipt=await ledger.acceptSiteScopeFixture(p,site,run,deletions);
 const observe=async(path:string,text:string,mime:string)=>ledger.acceptHttpFixture(p,site,{attemptId:randomUUID(),capturedAt:new Date(Date.now()-1000).toISOString()},{url:url+path,final_url:url+path,method:'GET',status_code:200,headers:[{name:'content-type',value:mime}],truncated:false,error:null},Buffer.from(text));
 const pageUrl=url+pagePath;
 const robots=await observe('robots.txt','User-agent: *\nAllow: /\n','text/plain'),sitemap=await observe(indexed?'leaf.xml':'sitemap.xml','<urlset><url><loc>'+pageUrl+'</loc></url></urlset>','application/xml');
 const index=indexed?await observe('sitemap.xml','<sitemapindex><sitemap><loc>'+url+'leaf.xml</loc></sitemap></sitemapindex>','application/xml'):null;
 const prerequisiteEvidence=[scopeReceipt.evidenceId,robots.bodyEvidenceId!,robots.receiptEvidenceId,sitemap.bodyEvidenceId!,sitemap.receiptEvidenceId,...(index?[index.bodyEvidenceId!,index.receiptEvidenceId]:[])],prerequisiteObservations=[scopeReceipt.observationId,robots.observationId,sitemap.observationId,...(index?[index.observationId]:[])];
 const admission=await ledger.freeze(p,site,await ledger.cutoff(p,site),prerequisiteEvidence,prerequisiteObservations);
 let leafAdmission=admission;
 if(index){await new FixtureFrontier(runtime,deletions,blobs).discoverSitemap(p,site,run,admission,index.observationId,robots.observationId);leafAdmission=await ledger.freeze(p,site,await ledger.cutoff(p,site),prerequisiteEvidence,prerequisiteObservations);}
 await new FixtureFrontier(runtime,deletions,blobs).discoverSitemap(p,site,run,leafAdmission,sitemap.observationId,robots.observationId);
 const receipt=await ledger.acceptHttpFixture(p,site,{attemptId:randomUUID(),capturedAt:new Date(Date.now()-1000).toISOString()},{url:pageUrl,final_url:pageUrl,method:'GET',status_code:200,headers:[{name:'content-type',value:contentType}],truncated:false,error:null,...changes},body);
 const evidence=[...prerequisiteEvidence,receipt.bodyEvidenceId!,receipt.receiptEvidenceId],observations=[...prerequisiteObservations,receipt.observationId];
 const initial=await ledger.freeze(p,site,await ledger.cutoff(p,site),evidence,observations);
 await jobs.enqueue(p,site,run,initial,digest,randomUUID(),'project');const projection=(await worker.claim())!;assert.ok(projection);
 const snapshot=await worker.projectHttpFixture(projection,receipt.observationId);
 const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),evidence,observations);
 const leaseFor=async(input=bundle,kind='project',runId=run)=>{await jobs.enqueue(p,site,runId,input,digest,randomUUID(),kind);const lease=(await worker.claim())!;assert.ok(lease);return lease;};
 const lease=await leaseFor();return {url,pageUrl,site,run,digest,receipt,scopeReceipt,robots,sitemap,index,admission,leafAdmission,initial,bundle,snapshot,lease,evidence,observations,leaseFor};
}
async function counts(){return (await admin.query('SELECT (SELECT count(*) FROM aios.evidence) AS evidence,(SELECT count(*) FROM aios.outbox) AS events,(SELECT count(*) FROM aios.render_snapshot) AS renders')).rows[0];}
test('Persisted raw HTTP charset prepares exact replay bytes without writing evidence or completing its lease',async()=>{
 const body=Buffer.from('<title>Caf\xe9</title>','latin1'),f=await setup(body,'text/html; charset=windows-1252'),before=await counts();
 const result=await worker.prepareOfflineRenderFixture(f.lease,f.snapshot);assert.equal(result.prepared.state,'prepared');if(result.prepared.state!=='prepared')return;
 assert.equal(result.prepared.html,'<title>Café</title>');assert.equal(result.prepared.source.rawSha256,hash(body));assert.equal(result.prepared.inputSha256,hash(Buffer.from(result.prepared.html)));assert.notEqual(result.prepared.inputSha256,result.prepared.source.rawSha256);
 assert.equal(result.source.pageSnapshotId,f.snapshot);assert.equal(result.source.rawEvidenceId,f.receipt.bodyEvidenceId);assert.equal(result.source.bundleId,f.bundle);assert.deepEqual(await counts(),before);
 assert.equal((await admin.query('SELECT state FROM aios.job WHERE job_id=$1',[f.lease.jobId])).rows[0].state,'leased');
 const fresh=new pg.Pool({...cfg,user:'aios_scheduler'});try{assert.deepEqual(await new Jobs(fresh,deletions,blobs).prepareOfflineRenderFixture(f.lease,f.snapshot),result);}finally{await fresh.end();}
 if(process.env.AIOS_TEST_RENDER_SOURCE==='1'){
  const executed=spawnSync(process.execPath,['--import','tsx','scripts/test-render.mjs','--prepared-source'],{input:JSON.stringify(result.prepared),encoding:'utf8',env:process.env,timeout:120000,maxBuffer:1024*1024});
  assert.equal(executed.status,0,executed.stdout+executed.stderr+String(executed.error??''));
 }
});
test('Snapshot scope, frozen cutoff and exact retained references cannot be substituted',async()=>{
 const f=await setup();
 for(const forged of [{...f.lease,tenantId:randomUUID()},{...f.lease,siteId:randomUUID()}])await assert.rejects(worker.prepareOfflineRenderFixture(forged,f.snapshot),/run_fenced|scope_denied|lease_lost/);
 await assert.rejects(worker.prepareOfflineRenderFixture(f.lease,randomUUID()),/snapshot_unavailable|scope_denied/);
 const old=await f.leaseFor(f.initial);await assert.rejects(worker.prepareOfflineRenderFixture(old,f.snapshot),/snapshot_unavailable|scope_denied|bundle_membership_required/);
 const missing=await ledger.freeze(p,f.site,await ledger.cutoff(p,f.site),f.evidence.filter(id=>id!==f.receipt.receiptEvidenceId),f.observations.filter(id=>id!==f.receipt.observationId)),unbound=await f.leaseFor(missing);
 await assert.rejects(worker.prepareOfflineRenderFixture(unbound,f.snapshot),/snapshot_unavailable|scope_denied|bundle_membership_required/);
 await jobs.cancel(p,f.site,f.run);const other=await submit(f.site),crossRun=await f.leaseFor(f.bundle,'project',other);
 await assert.rejects(worker.prepareOfflineRenderFixture(crossRun,f.snapshot),/snapshot_unavailable|scope_denied/);
});
test('Admitted target and frozen scope/robots provenance are mandatory preparation inputs',async()=>{
 const f=await setup();
 for(const omitted of [f.scopeReceipt.evidenceId,f.robots.receiptEvidenceId,f.robots.bodyEvidenceId!]){
  const bundle=await ledger.freeze(p,f.site,await ledger.cutoff(p,f.site),f.evidence.filter(id=>id!==omitted),f.observations.filter(id=>id!==(omitted===f.scopeReceipt.evidenceId?f.scopeReceipt.observationId:f.robots.observationId))),lease=await f.leaseFor(bundle);
  await assert.rejects(worker.prepareOfflineRenderFixture(lease,f.snapshot),/bundle_membership_required/);
 }
 await admin.query("UPDATE aios.crawl_target SET admitted=false,state='discovered' WHERE crawl_id=$1",[f.run]);
 await assert.rejects(worker.prepareOfflineRenderFixture(f.lease,f.snapshot),/parent_unavailable/);
});
test('Tampered private bytes and non-project handlers cannot prepare renderer input',async()=>{
 const f=await setup(),bad=new Jobs(scheduler,deletions,{read:async(...args)=>Buffer.concat([await blobs.read(...args),Buffer.from('tampered')])});
 await assert.rejects(bad.prepareOfflineRenderFixture(f.lease,f.snapshot),/artifact_integrity_failed/);
 const audit=await f.leaseFor(f.bundle,'audit');await assert.rejects(worker.prepareOfflineRenderFixture(audit,f.snapshot),/handler_not_installed/);
});
test('Partial and unsupported retained documents abstain without fabricating complete HTML',async()=>{
 const partial=await setup(Buffer.from('<title>Partial'),'text/html',{truncated:true});assert.deepEqual((await worker.prepareOfflineRenderFixture(partial.lease,partial.snapshot)).prepared,{state:'not_prepared',reason:'truncated'});await jobs.cancel(p,partial.site,partial.run);
 const xml=await setup(Buffer.from('<html><title>XML</title></html>'),'application/xhtml+xml');assert.deepEqual((await worker.prepareOfflineRenderFixture(xml.lease,xml.snapshot)).prepared,{state:'not_prepared',reason:'unsupported_mime'});
});
test('Current revocation, cancellation, membership and deletion fence retained-source preparation',async()=>{
 const f=await setup();await admin.query("UPDATE aios.membership SET state='revoked' WHERE tenant_id=$1",[p.tenantId]);await assert.rejects(worker.prepareOfflineRenderFixture(f.lease,f.snapshot),/scope_denied/);await admin.query("UPDATE aios.membership SET state='active' WHERE tenant_id=$1",[p.tenantId]);
 await registry.change(f.digest,'revoked','fixture current gate');await assert.rejects(worker.prepareOfflineRenderFixture(f.lease,f.snapshot),/skill_revoked/);await jobs.cancel(p,f.site,f.run);await assert.rejects(worker.prepareOfflineRenderFixture(f.lease,f.snapshot),/run_fenced/);
 const removed=await setup();await deletions.record(p.tenantId,removed.site);await assert.rejects(worker.prepareOfflineRenderFixture(removed.lease,removed.snapshot),/deleted_scope/);
});
test('Post-I/O checks reject changed authority and expiry without holding a transaction through artifact reads',async()=>{
 for(const kind of ['health','lease','cancel','revoke','delete']){
  const f=await setup();let delayed=false;
  const guarded=new Jobs(scheduler,deletions,{read:async(...args)=>{const bytes=await blobs.read(...args);if(!delayed){delayed=true;if(kind==='health')await admin.query("UPDATE control.health SET verified_until=clock_timestamp()-interval '1 second'");else if(kind==='lease')await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",[f.lease.jobId]);else if(kind==='cancel')await jobs.cancel(p,f.site,f.run);else if(kind==='revoke')await registry.change(f.digest,'revoked','during fixture artifact I/O');else await deletions.record(p.tenantId,f.site);}return bytes;}});
  await assert.rejects(guarded.prepareOfflineRenderFixture(f.lease,f.snapshot),kind==='health'?/policy_unavailable/:kind==='lease'?/lease_lost/:kind==='cancel'?/run_fenced/:kind==='revoke'?/skill_revoked/:/deleted_scope/);
  await admin.query("UPDATE control.health SET verified_until=clock_timestamp()+interval '1 hour'");if(kind!=='delete')await jobs.cancel(p,f.site,f.run);
 }
});
async function rejectSource(f:Awaited<ReturnType<typeof setup>>,sourceId:string){
 await transaction(evaluator,'aios_evaluator',async c=>{await scope(c,p,f.site);const time=await tick(c,p.tenantId),id=randomUUID();
  const row={record_type:'SelfAuditResult',id,schema_version:2,version:1,created_at:time.recorded_at,recorded_at:time.recorded_at,updated_at:time.recorded_at,deleted_at:null,state:'recorded',retention_class:'audit',tenant_id:p.tenantId,site_id:f.site,crawl_id:f.run,check_id:'A02',check_version:'1.1.0',result:'fail',effect:'reject_outputs',reason:'independent fixture rejection',knowledge_seq:time.knowledge_seq,scope:'outputs',scope_complete:true,dependency_snapshot_hash:'0'.repeat(64),recovery_of_id:null};
  const fields=Object.entries(row);await c.query(`INSERT INTO self_audit_result (${fields.map(([k])=>k).join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(([,v])=>v));await c.query('INSERT INTO audit_impact VALUES($1,$2,$3,$4,true)',[p.tenantId,f.site,id,sourceId]);
 });
}
test('Current audit rejection of actual retained raw evidence prevents further preparation',async()=>{
 const f=await setup();await rejectSource(f,f.receipt.bodyEvidenceId!);await assert.rejects(worker.prepareOfflineRenderFixture(f.lease,f.snapshot),/audit_input_rejected/);
});
test('Rejected sitemap ancestry cannot survive through an otherwise eligible raw snapshot',async()=>{
 const f=await setup(Buffer.from('<title>Service</title>'),'text/html',{},'services');await rejectSource(f,f.sitemap.bodyEvidenceId!);await assert.rejects(worker.prepareOfflineRenderFixture(f.lease,f.snapshot),/audit_input_rejected/);
});
test('Source context changed during private reads invalidates the previously resolved preparation',async()=>{
 const f=await setup();let changed=false;
 const reader=new Jobs(scheduler,deletions,{read:async(...args)=>{const bytes=await blobs.read(...args);if(!changed){changed=true;await admin.query('UPDATE aios.crawl_target SET priority=priority+1 WHERE crawl_id=$1',[f.run]);}return bytes;}});
 await assert.rejects(reader.prepareOfflineRenderFixture(f.lease,f.snapshot),/source_context_changed/);
});

test('An unrelated rejected frozen-bundle member does not suppress independently supported preparation',async()=>{
 const f=await setup(),extra=await ledger.accept(p,f.site,{attemptId:randomUUID(),sourceUri:f.url+'unrelated',capturedAt:new Date(Date.now()-1000).toISOString(),mimeType:'text/html',contextHash:manifestHash({fixture:'unrelated'})},Buffer.from('unrelated'));
 const input=await ledger.freeze(p,f.site,await ledger.cutoff(p,f.site),[...f.evidence,extra.evidenceId],[...f.observations,extra.observationId]),lease=await f.leaseFor(input);
 await rejectSource(f,extra.evidenceId);assert.equal((await worker.prepareOfflineRenderFixture(lease,f.snapshot)).prepared.state,'prepared');
});
test('Rejected ancestor sitemap index blocks the non-seed descendant selected for replay',async()=>{
 const f=await setup(Buffer.from('<title>Indexed service</title>'),'text/html',{},'services',true);assert.ok(f.index);await rejectSource(f,f.index.bodyEvidenceId!);
 await assert.rejects(worker.prepareOfflineRenderFixture(f.lease,f.snapshot),/audit_input_rejected/);
});

test('Rejected link-source snapshot blocks its actual discovered child replay',async()=>{
 const f=await setup(Buffer.from('<a href="/linked">Service</a>'));
 await new FixtureLinkFrontier(runtime,deletions,blobs).discoverLinks(p,f.site,f.run,f.bundle,f.snapshot,f.robots.observationId);
 const url=f.url+'linked',raw=await ledger.acceptHttpFixture(p,f.site,{attemptId:randomUUID(),capturedAt:new Date(Date.now()-1000).toISOString()},{url,final_url:url,method:'GET',status_code:200,headers:[{name:'content-type',value:'text/html'}],truncated:false,error:null},Buffer.from('<title>Linked</title>'));
 const evidence=[...f.evidence,raw.bodyEvidenceId!,raw.receiptEvidenceId],observations=[...f.observations,raw.observationId];
 const input=await ledger.freeze(p,f.site,await ledger.cutoff(p,f.site),evidence,observations),projection=await f.leaseFor(input);
 const child=await worker.projectHttpFixture(projection,raw.observationId),bundle=await ledger.freeze(p,f.site,await ledger.cutoff(p,f.site),evidence,observations),lease=await f.leaseFor(bundle);
 assert.equal((await worker.prepareOfflineRenderFixture(lease,child)).prepared.state,'prepared');
 await rejectSource(f,f.snapshot);await assert.rejects(worker.prepareOfflineRenderFixture(lease,child),/audit_input_rejected/);
});

test('Rejected ancestor-index admission bundle blocks its descendant without rejecting unrelated bundle members',async()=>{
 const f=await setup(Buffer.from('<title>Descendant service</title>'),'text/html',{},'services',true);assert.notEqual(f.admission,f.leafAdmission);
 assert.equal((await worker.prepareOfflineRenderFixture(f.lease,f.snapshot)).prepared.state,'prepared');
 await rejectSource(f,f.admission);await assert.rejects(worker.prepareOfflineRenderFixture(f.lease,f.snapshot),/audit_input_rejected/);
});
