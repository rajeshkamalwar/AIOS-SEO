import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {migrate} from '../packages/persistence/migrate.js';
import {Ledger,type Principal} from '../packages/persistence/index.js';
import {transaction,scope,tick} from '../packages/persistence/transaction.js';
import {LocalBlobs} from '../packages/evidence/index.js';
import {DeletionLedger} from '../packages/policy/deletion.js';
import {assertInputsEligible} from '../packages/policy/input-eligibility.js';
import {FixtureFrontier} from '../packages/jobs/frontier.js';
import {Jobs} from '../packages/jobs/index.js';

const config={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_input_eligibility_test'};
const p:Principal={tenantId:randomUUID(),userId:randomUUID()};
let admin:pg.Pool,runtime:pg.Pool,evaluator:pg.Pool,operator:pg.Pool,ledger:Ledger,blobs:LocalBlobs,deletions:DeletionLedger,jobs:Jobs;
before(async()=>{
 const setup=new pg.Pool({...config,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_input_eligibility_test');await setup.end();
 admin=new pg.Pool({...config,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_evaluator','aios_operator'])await admin.query(`ALTER ROLE ${role} LOGIN`);
 runtime=new pg.Pool({...config,user:'aios_runtime'});evaluator=new pg.Pool({...config,user:'aios_evaluator'});operator=new pg.Pool({...config,user:'aios_operator'});
 for(const [type,table,changes] of [
  ['Tenant','tenant',{id:p.tenantId}],['User','app_user',{id:p.userId,subject:p.userId}],['Membership','membership',{id:randomUUID(),tenant_id:p.tenantId,user_id:p.userId}],
 ] as const){
  const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes};
  const entries=Object.entries(row).filter(([key])=>!['provenance_ids','site_scope_ids'].includes(key));
  await admin.query(`INSERT INTO aios.${table} (${entries.map(([key])=>key).join(',')}) VALUES (${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,value])=>value));
 }
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'input-eligibility-blobs'),'local-synthetic-v1');deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'input-eligibility-deletions'));
 ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");
 for(const kind of ['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'])await admin.query('INSERT INTO control.tenant_cap VALUES($1,$2,10000)',[p.tenantId,kind]);
});
afterEach(async()=>{for(const run of (await admin.query("SELECT id,site_id FROM aios.crawl WHERE state IN ('queued','running','blocked')")).rows)await jobs.cancel(p,run.site_id,run.id);});
after(async()=>{for(const pool of [runtime,evaluator,operator,admin])await pool?.end();});
async function newRun(site:string){return jobs.submit(p,site,randomUUID(),{http_requests:10,render_requests:0,render_pages:0,model_calls:0,tokens:0,cost_microusd:0,deadline:new Date(Date.now()+600000).toISOString()});}
async function fixture(){
 const origin='https://'+randomUUID()+'.example',site=await ledger.registerSite(p,origin+'/'),run=await newRun(site);
 const capture=()=>ledger.accept(p,site,{attemptId:randomUUID(),sourceUri:origin+'/',capturedAt:new Date(Date.now()-1000).toISOString(),mimeType:'text/html',contextHash:'0'.repeat(64)},Buffer.from('fixture'));
 return {site,run,origin,a:await capture(),b:await capture()};
}
function check(site:string,run:string,ids:string[]){return transaction(runtime,'aios_runtime',async c=>{await scope(c,p,site);await assertInputsEligible(c,p.tenantId,site,run,ids);});}
// Test-only independent evaluator/operator writes; this is not a recovery API.
async function audit(site:string,run:string,affected:string[],changes:Record<string,unknown>={}){
 return transaction(evaluator,'aios_evaluator',async c=>{
  await scope(c,p,site);const time=await tick(c,p.tenantId),id=randomUUID();
  const row={record_type:'SelfAuditResult',id,schema_version:2,version:1,created_at:time.recorded_at,recorded_at:time.recorded_at,updated_at:time.recorded_at,deleted_at:null,state:'recorded',retention_class:'audit',tenant_id:p.tenantId,site_id:site,crawl_id:run,check_id:'A02',check_version:'1.1.0',result:'fail',effect:'reject_outputs',reason:'independent fixture',knowledge_seq:time.knowledge_seq,scope:'outputs',scope_complete:true,dependency_snapshot_hash:'0'.repeat(64),recovery_of_id:null,...changes};
  const entries=Object.entries(row);await c.query(`INSERT INTO self_audit_result (${entries.map(([key])=>key).join(',')}) VALUES (${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,value])=>value));
  for(const [i,output] of affected.entries())await c.query('INSERT INTO audit_impact VALUES($1,$2,$3,$4,$5)',[p.tenantId,site,id,output,i===0]);
  return id;
 });
}
async function review(site:string,receipt:string,passing:string,when?:string){
 await transaction(operator,'aios_operator',async c=>{await scope(c,p,site);await c.query('INSERT INTO audit_recovery(tenant_id,receipt_id,passing_receipt_id,reviewed_at) VALUES($1,$2,$3,coalesce($4::timestamptz,clock_timestamp()))',[p.tenantId,receipt,passing,when??null]);});
}
test('direct and persisted transitive impacts block while independent inputs continue',async()=>{
 const f=await fixture();await audit(f.site,f.run,[f.a.evidenceId,f.a.observationId]);
 for(const id of [f.a.evidenceId,f.a.observationId])await assert.rejects(check(f.site,f.run,[id]),/audit_input_rejected/);
 await check(f.site,f.run,[f.b.evidenceId,f.b.observationId]);
 assert.equal((await admin.query('SELECT quarantined FROM aios.work_fence WHERE crawl_id=$1',[f.run])).rows[0].quarantined,false);
});
test('current restrictions cannot be hidden by historical cutoff, another run or reconnect',async()=>{
 const f=await fixture();await ledger.freeze(p,f.site,await ledger.cutoff(p,f.site),[f.a.evidenceId],[f.a.observationId]);
 await audit(f.site,f.run,[f.a.evidenceId]);const second=await newRun(f.site);
 await assert.rejects(check(f.site,second,[f.a.evidenceId]),/audit_input_rejected/);
 await runtime.end();runtime=new pg.Pool({...config,user:'aios_runtime'});ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);
 await assert.rejects(check(f.site,second,[f.a.evidenceId]),/audit_input_rejected/);await check(f.site,second,[f.b.evidenceId]);
 await assert.rejects(check(f.site,second,[randomUUID()]),/scope_denied/);
});
test('run-integrity and incomplete impact scope fence all current-run inputs without relying on projection',async()=>{
 for(const change of [{effect:'quarantine_run',scope:'run'},{scope_complete:false},{scope:'run'}]){
  const f=await fixture();await audit(f.site,f.run,[f.a.evidenceId],change);
  await assert.rejects(check(f.site,f.run,[f.b.evidenceId]),/audit_run_quarantined/);
 }
 const f=await fixture();await audit(f.site,f.run,[]);await assert.rejects(check(f.site,f.run,[f.b.evidenceId]),/audit_run_quarantined/);
});
test('new pass alone never clears rejection; separately reviewed matching recovery does',async()=>{
 const f=await fixture(),bad=await audit(f.site,f.run,[f.a.evidenceId]);
 const passing=await audit(f.site,f.run,[],{result:'pass',effect:'allow',recovery_of_id:bad});
 await assert.rejects(check(f.site,f.run,[f.a.evidenceId]),/audit_input_rejected/);
 await review(f.site,bad,passing);await check(f.site,f.run,[f.a.evidenceId]);
 await admin.query('UPDATE aios.work_fence SET quarantined=true WHERE crawl_id=$1',[f.run]);
 await assert.rejects(check(f.site,f.run,[f.a.evidenceId]),/audit_run_quarantined/);
});
test('invalid recovery linkage, rule, scope, sequence and review time remain rejected',async()=>{
 for(const changes of [{recovery_of_id:null},{check_id:'A11'},{check_version:'unapproved'},{result:'unknown'},{scope_complete:false},{recorded_at:'2000-01-01T00:00:00Z'},{knowledge_seq:1}]){
  const f=await fixture(),bad=await audit(f.site,f.run,[f.a.evidenceId]);
  const passing=await audit(f.site,f.run,[],{result:'pass',effect:'allow',recovery_of_id:bad,...changes});await review(f.site,bad,passing);
  await assert.rejects(check(f.site,f.run,[f.a.evidenceId]),/audit_input_rejected|audit_run_quarantined/);
 }
 const f=await fixture(),bad=await audit(f.site,f.run,[f.a.evidenceId]),passing=await audit(f.site,f.run,[],{result:'pass',effect:'allow',recovery_of_id:bad});
 await review(f.site,bad,passing,'2000-01-01T00:00:00Z');await assert.rejects(check(f.site,f.run,[f.a.evidenceId]),/audit_input_rejected/);
});
test('one valid recovery cannot cancel other restrictions or use a rejected passing witness',async()=>{
 const f=await fixture(),bad=await audit(f.site,f.run,[f.a.evidenceId]),passing=await audit(f.site,f.run,[],{result:'pass',effect:'allow',recovery_of_id:bad});
 await review(f.site,bad,passing);await audit(f.site,f.run,[passing],{check_id:'A11'});
 await assert.rejects(check(f.site,f.run,[f.a.evidenceId]),/audit_input_rejected/);
 const g=await fixture(),a=await audit(g.site,g.run,[g.a.evidenceId]);await audit(g.site,g.run,[g.a.evidenceId],{check_id:'A07'});
 const pass=await audit(g.site,g.run,[],{result:'pass',effect:'allow',recovery_of_id:a});await review(g.site,a,pass);
 await assert.rejects(check(g.site,g.run,[g.a.evidenceId]),/audit_input_rejected/);
});
test('application/evaluator cannot self-review and operator cannot invent passing evaluator receipts',async()=>{
 const f=await fixture(),bad=await audit(f.site,f.run,[f.a.evidenceId]),passing=await audit(f.site,f.run,[],{result:'pass',effect:'allow',recovery_of_id:bad});
 for(const pool of [runtime,evaluator])await assert.rejects(pool.query('INSERT INTO aios.audit_recovery(tenant_id,receipt_id,passing_receipt_id) VALUES($1,$2,$3)',[p.tenantId,bad,passing]),/permission denied/);
 await assert.rejects(runtime.query('INSERT INTO aios.self_audit_result DEFAULT VALUES'),/permission denied/);
 await assert.rejects(operator.query('INSERT INTO aios.self_audit_result DEFAULT VALUES'),/permission denied/);
 await assert.rejects(runtime.query('DELETE FROM aios.audit_impact'),/permission denied/);
});
test('frontier refuses rejected body and serializes concurrent evaluator admission across artifact I/O',async()=>{
 for(const duringRead of [false,true]){
  const f=await fixture(),sc=await ledger.acceptSiteScopeFixture(p,f.site,f.run,deletions);
  const http=(path:string,body:string)=>ledger.acceptHttpFixture(p,f.site,{attemptId:randomUUID(),capturedAt:new Date(Date.now()-1000).toISOString()},{url:f.origin+path,final_url:f.origin+path,method:'GET',status_code:200,headers:[{name:'content-type',value:path.endsWith('.txt')?'text/plain':'application/xml'}],truncated:false,error:null},Buffer.from(body));
  const robots=await http('/robots.txt','User-agent: *\n'),map=await http('/sitemap.xml','<urlset><url><loc>'+f.origin+'/child</loc></url></urlset>');
  const bundle=await ledger.freeze(p,f.site,await ledger.cutoff(p,f.site),[sc.evidenceId,robots.receiptEvidenceId,robots.bodyEvidenceId!,map.receiptEvidenceId,map.bodyEvidenceId!],[sc.observationId,robots.observationId,map.observationId]);
  if(!duringRead)await audit(f.site,f.run,[map.bodyEvidenceId!]);
  let added=false,writer:Promise<string>|undefined;
  const artifacts={read:async(key:string,sha:string,size:number)=>{
   const bytes=await blobs.read(key,sha,size);
   if(duringRead&&!added){
    added=true;writer=audit(f.site,f.run,[map.bodyEvidenceId!]);
    // Prove the independent evaluator waits before taking the clock row,
    // while the consumer remains able to tick and commit without deadlock.
    let blocked=false;
    for(let i=0;i<100&&!blocked;i++){
     blocked=Boolean((await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND usename='aios_evaluator' AND wait_event='advisory'")).rowCount);
     if(!blocked)await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(blocked,true);
   }
   return bytes;
  }};
  const discover=()=>new FixtureFrontier(runtime,deletions,artifacts).discoverSitemap(p,f.site,f.run,bundle,map.observationId,robots.observationId);
  if(duringRead){await discover();await writer;await assert.rejects(discover(),/audit_input_rejected/);}
  else await assert.rejects(discover(),/audit_input_rejected/);
  assert.equal((await admin.query('SELECT * FROM aios.fixture_frontier_batch WHERE crawl_id=$1',[f.run])).rowCount,duringRead?1:0);
 }
});
test('two independently reviewed run recoveries do not circularly block each other',async()=>{
 const f=await fixture();
 for(const check_id of ['A03','A06']){
  const bad=await audit(f.site,f.run,[],{effect:'quarantine_run',scope:'run',check_id});
  const passing=await audit(f.site,f.run,[],{result:'pass',effect:'allow',scope:'run',check_id,recovery_of_id:bad});
  await review(f.site,bad,passing);
 }
 await check(f.site,f.run,[f.a.evidenceId]);
});
test('incomplete original-run scope fences known outputs reused by another run',async()=>{
 const f=await fixture(),later=await newRun(f.site);
 await transaction(evaluator,'aios_evaluator',async c=>{await scope(c,p,f.site);await c.query('INSERT INTO audit_output VALUES($1,$2,$3,$4)',[p.tenantId,f.site,f.run,f.a.evidenceId]);});
 await audit(f.site,f.run,[],{scope_complete:false});
 await assert.rejects(check(f.site,later,[f.a.evidenceId]),/audit_run_quarantined/);
 await check(f.site,later,[f.b.evidenceId]);
});
test('oversized persisted audit graph fails closed instead of loading partial restrictions',async()=>{
 const f=await fixture();
 const receipt=await audit(f.site,f.run,[],{result:'pass',effect:'allow'});
 await admin.query(`INSERT INTO aios.self_audit_result SELECT record_type,gen_random_uuid(),schema_version,version,created_at,recorded_at,updated_at,deleted_at,state,retention_class,tenant_id,site_id,crawl_id,check_id,check_version,result,effect,reason,knowledge_seq,scope,scope_complete,dependency_snapshot_hash,recovery_of_id FROM aios.self_audit_result CROSS JOIN generate_series(1,5000) WHERE id=$1`,[receipt]);
 await assert.rejects(check(f.site,f.run,[f.a.evidenceId]),/audit_graph_budget_exceeded/);
});
test('direct source association writer cannot cross an active consumer eligibility boundary',async()=>{
 const f=await fixture(),later=await newRun(f.site);
 await audit(f.site,f.run,[],{scope_complete:false});
 let writer:Promise<void>|undefined;
 await transaction(runtime,'aios_runtime',async c=>{
  await scope(c,p,f.site);await assertInputsEligible(c,p.tenantId,f.site,later,[f.a.evidenceId]);
  writer=transaction(evaluator,'aios_evaluator',async w=>{await scope(w,p,f.site);await w.query('INSERT INTO audit_output VALUES($1,$2,$3,$4)',[p.tenantId,f.site,f.run,f.a.evidenceId]);});
  let blocked=false;
  for(let i=0;i<100&&!blocked;i++){
   blocked=Boolean((await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND usename='aios_evaluator' AND wait_event='advisory'")).rowCount);
   if(!blocked)await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(blocked,true);
  await assertInputsEligible(c,p.tenantId,f.site,later,[f.a.evidenceId]);
 });
 await writer;await assert.rejects(check(f.site,later,[f.a.evidenceId]),/audit_run_quarantined/);
});
