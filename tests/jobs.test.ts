import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID,generateKeyPairSync,sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { migrate } from '../packages/persistence/migrate.js';
import { Ledger,type Principal,type HttpFixtureResult } from '../packages/persistence/index.js';
import { LocalBlobs } from '../packages/evidence/index.js';
import { Registry } from '../packages/skills/index.js';
import { Jobs,type Budget,type Lease } from '../packages/jobs/index.js';
import { DeletionLedger } from '../packages/policy/deletion.js';
import { canonical,manifestHash } from '../packages/contracts/index.js';
import { PostgresReadOnlyStore, ReadOnlyApi } from '../packages/api/index.js';
import { parseRobots, parseSitemap, loadFixtures } from '../packages/perception/index.js';
import { literalClaims, graphProjection } from '../packages/understanding/index.js';
import { createServer } from 'node:http';
import { collectPublicHop } from '../packages/perception/collector.js';
import { requestPinned } from '../packages/perception/transport.js';
import { robotsState, pageAllowed } from '../packages/perception/robots-admission.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_jobs_test'};
const root=process.env.AIOS_TEST_ROOT!;
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool,evaluator:pg.Pool;
let ledger:Ledger,commands:Jobs,worker:Jobs,registry:Registry,deletions:DeletionLedger,blobs:LocalBlobs;
let p:Principal,site:string,bundle:string,digest:string,evidenceId:string;
const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID(),author=randomUUID();
const budget=():Budget=>({http_requests:10,render_requests:0,render_pages:0,model_calls:2,tokens:100,cost_microusd:1000,deadline:new Date(Date.now()+600000).toISOString()});
async function fixture(type:string,changes:Record<string,unknown>){
 const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes};
 const table=({Tenant:'tenant',User:'app_user',Membership:'membership'} as Record<string,string>)[type];
 const entries=Object.entries(row).filter(([k])=>!['provenance_ids','site_scope_ids'].includes(k));
 await admin.query(`INSERT INTO aios.${table} (${entries.map(([k])=>k).join(',')}) VALUES(${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));
}
async function approve(name=String(randomUUID()),dependencies:string[]=[]){
 const manifest=JSON.parse(await readFile('spec/examples/skill-reliability-gate.json','utf8'));
 manifest.skill_id='seo.test-'+name.replace(/[0-9]/g,d=>String.fromCharCode(103+Number(d)));manifest.version='1.0.0';manifest.last_verified=new Date().toISOString();manifest.freshness_deadline=new Date(Date.now()+3600000).toISOString();
 const approval={author,reviewer,manifest_digest:manifestHash(manifest),evaluation_digest:manifestHash({fixture:true}),approved_at:new Date().toISOString(),scope:'local-synthetic-v1' as const,dependencies};
 const signature=sign(null,Buffer.from(canonical(approval)),keys.privateKey).toString('base64');
 return registry.approve(manifest,approval,signature);
}
async function run(release=digest){const id=await commands.submit(p,site,randomUUID(),budget());const job=await commands.enqueue(p,site,id,bundle,release,'audit');return {id,job};}
async function stopAll(){for(const r of (await admin.query("SELECT id FROM aios.crawl WHERE state IN ('queued','running','blocked')")).rows)await commands.cancel(p,site,r.id);}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});
 await setup.query('CREATE DATABASE aios_jobs_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator','aios_evaluator'])await admin.query(`ALTER ROLE ${role} LOGIN`);
 runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});evaluator=new pg.Pool({...cfg,user:'aios_evaluator'});
 p={tenantId:randomUUID(),userId:randomUUID()};await fixture('Tenant',{id:p.tenantId});await fixture('User',{id:p.userId,subject:p.userId});await fixture('Membership',{id:randomUUID(),tenant_id:p.tenantId,user_id:p.userId});
 blobs=await LocalBlobs.create(join(root,'jobs-blobs'),'local-synthetic-v1');ledger=new Ledger(runtime,blobs,'local-synthetic-v1');
 site=await ledger.registerSite(p,'https://jobs.example/');
 const receipt=await ledger.accept(p,site,{attemptId:randomUUID(),sourceUri:'https://jobs.example/',capturedAt:new Date(Date.now()-1000).toISOString(),mimeType:'text/html',contextHash:manifestHash({fixture:true})},Buffer.from('fixture')); evidenceId=receipt.evidenceId;
 bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[receipt.evidenceId],[receipt.observationId]);
 deletions=await DeletionLedger.open(join(root,'independent-deletion-ledger'));
 commands=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions);registry=new Registry(operator);
 await admin.query("UPDATE control.health SET verified_until=clock_timestamp()+interval '1 hour',restore_ready=true");
 await admin.query('INSERT INTO control.authority_key VALUES($1,$2,true)',[reviewer,keys.publicKey.export({type:'spki',format:'pem'})]);
 for(const kind of ['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'])await admin.query('INSERT INTO control.tenant_cap VALUES($1,$2,10000)',[p.tenantId,kind]);
 digest=await approve();
});
after(async()=>{for(const pool of [runtime,scheduler,operator,evaluator,admin])await pool?.end();});
test('M2 submission and job idempotency, immutable approved bytes, authority separation',async()=>{
 const b=budget(),key=randomUUID(),id=await commands.submit(p,site,key,b);
 assert.equal(await commands.submit(p,site,key,b),id);
 await assert.rejects(commands.submit(p,site,key,{...b,tokens:99}),/conflict/);
 const job=await commands.enqueue(p,site,id,bundle,digest,'a');assert.equal(await commands.enqueue(p,site,id,bundle,digest,'a'),job);
 await assert.rejects(runtime.query("UPDATE control.release SET semver='2.0.0'"),/permission denied/);
 await assert.rejects(runtime.query("INSERT INTO control.release_state VALUES($1,2,'approved',now(),'fake')",[digest]),/permission denied/);
 await assert.rejects(new Jobs(runtime,deletions).claim(),/service_authority_required/);
 await stopAll();
});
test('M2 simultaneous claims produce one live lease; duplicate result acceptance is fenced',async()=>{
 const r=await run();const claimed=await Promise.all([worker.claim(),worker.claim()]);
 const leases=claimed.filter((l):l is Lease=>!!l);assert.equal(leases.length,1,JSON.stringify((await admin.query("SELECT state,error FROM aios.job")).rows));const l=leases[0]!;
 assert.equal(l.runId,r.id);await worker.heartbeat(l);await worker.complete(l,bundle);
 await assert.rejects(worker.complete(l,bundle),/lease_lost/);
 assert.equal((await admin.query("SELECT count(*) FROM aios.outbox WHERE event_type='job.completed'")).rows[0].count,'1');await stopAll();
});
test('M2 atomic reservations never overspend and settlement is idempotent',async()=>{
 await run();const l=(await worker.claim())!;
 const results=await Promise.allSettled([worker.reserve(l,'tokens',70),worker.reserve(l,'tokens',70)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const id=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<string>).value;
 await worker.settle(l,id,20);await worker.settle(l,id,20);await assert.rejects(worker.settle(l,id,21),/conflict/);
 await worker.reserve(l,'tokens',80);await assert.rejects(worker.reserve(l,'tokens',1),/budget_exhausted/);await stopAll();
});
test('M2 cancellation fences lease and retains unknown cost reservations',async()=>{
 const r=await run(),l=(await worker.claim())!;await worker.reserve(l,'cost_microusd',1000);
 await commands.cancel(p,site,r.id);await assert.rejects(worker.complete(l,bundle),/run_fenced/);
 assert.equal((await admin.query("SELECT amount FROM aios.budget_reservation WHERE job_id=$1 AND state='reserved'",[l.jobId])).rows[0].amount,'1000');
});
test('M2 expiry retries original immutable job, stale worker cannot heartbeat or accept',async()=>{
 await run();const old=(await worker.claim())!;
 await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",[old.jobId]);await worker.sweep();
 await assert.rejects(worker.heartbeat(old),/lease_lost/);const next=(await worker.claim())!;
 assert.equal(next.jobId,old.jobId);assert.equal(next.attempt,2);assert.notEqual(next.token,old.token);
 await assert.rejects(worker.complete(old,bundle),/lease_lost/);
 await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",[next.jobId]);await worker.sweep();
 const last=(await worker.claim())!;assert.equal(last.attempt,3);
 await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",[last.jobId]);await worker.sweep();
 assert.equal((await admin.query('SELECT state FROM aios.job WHERE job_id=$1',[last.jobId])).rows[0].state,'dead_letter');assert.equal(await worker.claim(),null);await stopAll();
});
test('M2 transitive revocation blocks admission, dispatch, and result acceptance',async()=>{
 const dep=await approve(),parent=await approve(undefined,[dep]);await run(parent);const l=(await worker.claim())!;
 await registry.change(dep,'revoked','test revocation');await assert.rejects(worker.complete(l,bundle),/skill_revoked/);await assert.rejects(worker.reserve(l,'tokens',1),/skill_revoked/);
 const id=await commands.submit(p,site,randomUUID(),budget());await assert.rejects(commands.enqueue(p,site,id,bundle,parent,'revoked'),/skill_revoked/);await stopAll();
 const revokedRelease=await approve();await run(revokedRelease);await registry.change(revokedRelease,'revoked','before dispatch');assert.equal(await worker.claim(),null);await stopAll();
});
test('M5 durable API adapter submits and reopens a persisted run',async()=>{
 await loadFixtures();
 const robots=parseRobots('User-agent: *\nDisallow: /private\nSitemap: https://jobs.example/sitemap.xml');
 assert.equal(robots.rules.length,1); const sitemap=parseSitemap('<urlset><url><loc>https://jobs.example/</loc></url><url><loc>https://jobs.example/services</loc></url></urlset>','https://jobs.example/');assert.equal(sitemap.urls.length,2);
 const store=new PostgresReadOnlyStore(runtime,ledger,deletions),api=new ReadOnlyApi(store,'csrf');
 const accepted=await api.handle({method:'POST',path:'/v1/sites/discovery-runs',principal:p,csrf:'csrf',body:{url:'https://jobs.example/',idempotency_key:'m5-durable-0123456'}});
 assert.equal(accepted.status,202);
 const run=await api.handle({method:'GET',path:`/v1/discovery-runs/${(accepted.body as any).run_id}`,principal:p});
 assert.equal(run.status,200);assert.equal((run.body as any).state,'queued');
 const now=new Date().toISOString();
 const claims=literalClaims('<title>Jobs Plumbing</title><p>Services: pipe repair. Serving Nagpur.</p>',evidenceId);
 const graph=graphProjection(site,1,now,[],[]);assert.equal(claims.length,3);assert.equal(graph.edges.length,0);
 await admin.query("INSERT INTO aios.publication(tenant_id,site_id,watermark,twin_revision_id,cards,graph,coverage,missing_sources) VALUES($1,$2,1,NULL,'[]',$3,$4,$5)",[p.tenantId,site,JSON.stringify({site_id:site,watermark:1,known_at:now,valid_at:now,view:'client',nodes:[],edges:[],truncated:false,next_cursor:null},),JSON.stringify({status:'unknown',requested:0,observed:0,failed:0,excluded:0,deferred:0,denominator:'unknown_population',reason:'not_connected'}),['gsc','analytics','bing','serp','rankings','ai_answers']]);
 const reopened=await api.handle({method:'GET',path:`/v1/sites/${site}/understanding`,principal:p});assert.equal(reopened.status,200);assert.equal((reopened.body as any).watermark,1);
 await stopAll();
});
test('N1 submission creates one durable unadmitted seed atomically and idempotently', async()=>{
 const key=randomUUID(),b=budget();const id=await commands.submit(p,site,key,b);
 const rows=(await admin.query('SELECT * FROM aios.crawl_target WHERE tenant_id=$1 AND crawl_id=$2',[p.tenantId,id])).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].state,'discovered');assert.equal(rows[0].admitted,false);
 assert.equal(rows[0].url,'https://jobs.example/');assert.equal(rows[0].url_key,rows[0].url);
 assert.equal(rows[0].attempts,'0');
 assert.equal(await commands.submit(p,site,key,b),id);
 assert.equal((await admin.query('SELECT * FROM aios.crawl_target WHERE tenant_id=$1 AND crawl_id=$2',[p.tenantId,id])).rowCount,1);
 await assert.rejects(runtime.query("UPDATE aios.crawl_target SET admitted=true WHERE crawl_id=$1",[id]),/permission denied/);
 await stopAll();
});

test('N1 seed authority rejects missing scope and foreign URLs; event failure rolls back seed and run', async()=>{
 await assert.rejects(runtime.query('SELECT control.seed_submitted_target($1,$2)',[randomUUID(),'https://jobs.example/']),/scope_denied/);
 const id=await commands.submit(p,site,randomUUID(),budget());
 const c=await runtime.connect();
 try {
  await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",[p.tenantId,p.userId]);
  await assert.rejects(c.query('SELECT control.seed_submitted_target($1,$2)',[id,'https://foreign.example/']),/scope_denied/);
 } finally {await c.query('ROLLBACK');c.release();}
 await stopAll();
 const key=randomUUID();
 await admin.query("CREATE FUNCTION aios.test_seed_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'seed_event_failure'; END $$; CREATE TRIGGER test_seed_event_failure BEFORE INSERT ON aios.outbox FOR EACH ROW EXECUTE FUNCTION aios.test_seed_event_failure()");
 const before=(await admin.query('SELECT count(*) FROM aios.crawl_target')).rows[0].count;
 try {await assert.rejects(commands.submit(p,site,key,budget()),/seed_event_failure/);}
 finally {await admin.query('DROP TRIGGER test_seed_event_failure ON aios.outbox; DROP FUNCTION aios.test_seed_event_failure()');}
 assert.equal((await admin.query('SELECT 1 FROM aios.crawl WHERE idempotency_key=$1',[key])).rowCount,0);
 assert.equal((await admin.query('SELECT count(*) FROM aios.crawl_target')).rows[0].count,before);
});
async function projectionFixture(changes:Partial<HttpFixtureResult>={},body:Buffer|null=Buffer.from('<title>Fixture</title>'),release=digest,pinned=true,kind='project'){
 const receipt=await ledger.acceptHttpFixture(p,site,{attemptId:randomUUID(),capturedAt:new Date(Date.now()-1000).toISOString()},
  {url:'https://jobs.example/',method:'GET',status_code:404,headers:[{name:'content-type',value:'text/html'}],final_url:'https://jobs.example/',truncated:false,error:null,...changes},body);
 const input=pinned?await ledger.freeze(p,site,await ledger.cutoff(p,site),[...(receipt.bodyEvidenceId?[receipt.bodyEvidenceId]:[]),receipt.receiptEvidenceId],[receipt.observationId]):bundle;
 const runId=await commands.submit(p,site,randomUUID(),budget());await commands.enqueue(p,site,runId,input,release,randomUUID(),kind);
 const lease=(await worker.claim())!;assert.ok(lease);return {receipt,lease,input};
}
test('N1 project job derives persisted snapshot from exact pinned body and receipt',async()=>{
 const f=await projectionFixture(),projector=new Jobs(scheduler,deletions,blobs),id=await projector.projectHttpFixture(f.lease,f.receipt.observationId);
 const snapshot=(await admin.query('SELECT * FROM aios.page_snapshot WHERE id=$1',[id])).rows[0];
 assert.equal(snapshot.status_code,'404');assert.equal(snapshot.truncated,false);assert.equal(snapshot.evidence_id,f.receipt.bodyEvidenceId);
 assert.equal(snapshot.content_hash,(await admin.query('SELECT sha256 FROM aios.evidence WHERE id=$1',[f.receipt.bodyEvidenceId])).rows[0].sha256);
 assert.equal(snapshot.main_text_hash,null);assert.equal(snapshot.valid_from,null);
 const page=(await admin.query('SELECT * FROM aios.page WHERE id=$1',[snapshot.page_id])).rows[0];assert.equal(page.page_type,'unknown');assert.equal(page.url_key,'https://jobs.example/');
 assert.equal((await admin.query('SELECT * FROM aios.record_link WHERE owner_id=$1',[id])).rowCount,4);
 assert.equal((await admin.query('SELECT state,result_ref FROM aios.job WHERE job_id=$1',[f.lease.jobId])).rows[0].result_ref,id);
 const client=await runtime.connect();
 try{for(const owner of [id,page.id]){await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true)",[p.tenantId]);await assert.rejects(client.query("INSERT INTO aios.record_link VALUES($1,$2,'provenance_ids',4,$3,'Evidence')",[p.tenantId,owner,evidenceId]),/immutable_reference_set/);await client.query('ROLLBACK');}}finally{await client.query('ROLLBACK');client.release();}
 await assert.rejects(runtime.query('SELECT control.project_http_fixture($1,$2,$3,$4,$5,$6)',[f.lease.jobId,f.lease.token,f.lease.attempt,f.lease.attemptId,f.receipt.observationId,'{}']),/permission denied/);
 await assert.rejects(projector.projectHttpFixture(f.lease,f.receipt.observationId),/lease_lost/);
 assert.equal((await admin.query('SELECT * FROM aios.page_snapshot WHERE observation_id=$1',[f.receipt.observationId])).rowCount,1);await stopAll();
});
test('N1 projection requires project kind, pinned membership and retained body',async()=>{
 const projector=new Jobs(scheduler,deletions,blobs);
 const wrong=await projectionFixture({},undefined,digest,true,'audit');await assert.rejects(projector.projectHttpFixture(wrong.lease,wrong.receipt.observationId),/handler_not_installed/);await stopAll();
 const unpinned=await projectionFixture({},undefined,digest,false);await assert.rejects(projector.projectHttpFixture(unpinned.lease,unpinned.receipt.observationId),/bundle_membership_required/);await stopAll();
 const failed=await projectionFixture({status_code:null,error:{code:'timeout',retryable:true,detail:'fixture timeout',evidence_ids:[]}},null);await assert.rejects(projector.projectHttpFixture(failed.lease,failed.receipt.observationId),/snapshot_unavailable/);await stopAll();
 const redirect=await projectionFixture({status_code:302});await assert.rejects(projector.projectHttpFixture(redirect.lease,redirect.receipt.observationId),/snapshot_unavailable/);await stopAll();
});
test('N1 projection verifies body hashes and rejects modified receipt bytes',async()=>{
 const f=await projectionFixture();
 await assert.rejects(new Jobs(scheduler,deletions).projectHttpFixture(f.lease,f.receipt.observationId),/artifact_adapter_required/);
 const foreignSite=await ledger.registerSite(p,'https://foreign-jobs.example/');
 const foreignReceipt=await ledger.acceptHttpFixture(p,foreignSite,{attemptId:randomUUID(),capturedAt:new Date(Date.now()-1000).toISOString()},
  {url:'https://foreign-jobs.example/',method:'GET',status_code:200,headers:[{name:'content-type',value:'text/html'}],final_url:'https://foreign-jobs.example/',truncated:false,error:null},Buffer.from('foreign'));
 await assert.rejects(new Jobs(scheduler,deletions,blobs).projectHttpFixture(f.lease,foreignReceipt.observationId),/snapshot_unavailable/);
 const forged=new Jobs(scheduler,deletions,{read:async()=>Buffer.from('forged')});await assert.rejects(forged.projectHttpFixture(f.lease,f.receipt.observationId),/artifact_integrity_failed/);
 const corruptReceipt=new Jobs(scheduler,deletions,{read:async(key,sha,size)=>key.endsWith(f.receipt.receiptEvidenceId)?Buffer.from('{}'):blobs.read(key,sha,size)});
 await assert.rejects(corruptReceipt.projectHttpFixture(f.lease,f.receipt.observationId),/artifact_integrity_failed/);
 assert.equal((await admin.query('SELECT * FROM aios.page_snapshot WHERE observation_id=$1',[f.receipt.observationId])).rowCount,0);await stopAll();
});
test('N1 projection rejects expired, revoked and cancelled leases',async()=>{
 const projector=new Jobs(scheduler,deletions,blobs);
 const expired=await projectionFixture();await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",[expired.lease.jobId]);await assert.rejects(projector.projectHttpFixture(expired.lease,expired.receipt.observationId),/lease_lost/);await stopAll();
 const release=await approve(),revoked=await projectionFixture({},undefined,release);await registry.change(release,'revoked','projection fixture');await assert.rejects(projector.projectHttpFixture(revoked.lease,revoked.receipt.observationId),/skill_revoked/);await stopAll();
 const cancelled=await projectionFixture();await commands.cancel(p,site,cancelled.lease.runId);await assert.rejects(projector.projectHttpFixture(cancelled.lease,cancelled.receipt.observationId),/run_fenced/);
});
test('N1 projection preserves partial status and rolls back domain writes if completion event fails',async()=>{
 const f=await projectionFixture({truncated:true}),projector=new Jobs(scheduler,deletions,blobs);
 await admin.query("CREATE FUNCTION aios.test_projection_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'projection_event_failure'; END $$; CREATE TRIGGER test_projection_failure BEFORE INSERT ON aios.outbox FOR EACH ROW EXECUTE FUNCTION aios.test_projection_failure()");
 try{await assert.rejects(projector.projectHttpFixture(f.lease,f.receipt.observationId),/projection_event_failure/);}finally{await admin.query('DROP TRIGGER test_projection_failure ON aios.outbox; DROP FUNCTION aios.test_projection_failure()');}
 assert.equal((await admin.query('SELECT * FROM aios.page_snapshot WHERE observation_id=$1',[f.receipt.observationId])).rowCount,0);
 assert.equal((await admin.query('SELECT state FROM aios.job WHERE job_id=$1',[f.lease.jobId])).rows[0].state,'leased');
 const id=await projector.projectHttpFixture(f.lease,f.receipt.observationId);const r=(await admin.query('SELECT state,truncated FROM aios.page_snapshot WHERE id=$1',[id])).rows[0];assert.deepEqual(r,{state:'partial',truncated:true});await stopAll();
});
test('N1 actual loopback HTTP composes robots admission, evidence, frozen input and durable leased snapshot',async t=>{
 const requests:string[]=[],pageBytes=Buffer.from('<title>Fixture service unavailable</title>');
 const server=createServer((req,res)=>{
  requests.push(req.url!);
  if(req.url==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});res.end('User-agent: *\nDisallow: /private\n');}
  else if(req.url==='/services'){res.writeHead(404,{'content-type':'text/html; charset=utf-8'});res.end(pageBytes);}
  else{res.writeHead(500);res.end('unexpected fixture request');}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 const evidence:string[]=[],observations:string[]=[];
 const fetchFixture=async(path:string)=>{
  const url='https://jobs.example'+path;
  const response=await collectPublicHop(url,{
   lookupAll:async()=>[{address:'93.184.216.34',family:4}],
   // Explicit local test binding only. No external request or production adapter.
   transport:async(source,_ip,limits)=>requestPinned(new URL(`http://fixture.invalid:${address.port}${source.pathname}`),{address:'127.0.0.1',family:4},limits),
  });
  const accepted=await ledger.acceptHttpFixture(p,site,{attemptId:randomUUID(),capturedAt:new Date().toISOString()},
   {url,method:'GET',status_code:response.status,headers:Object.entries(response.headers).map(([name,value])=>({name,value})),final_url:response.finalUrl,truncated:response.truncated,error:null},response.body);
  evidence.push(accepted.receiptEvidenceId);if(accepted.bodyEvidenceId)evidence.push(accepted.bodyEvidenceId);observations.push(accepted.observationId);
  return {response,accepted};
 };
 const robots=await fetchFixture('/robots.txt'),policy=robotsState(robots.response);
 assert.equal(policy.state,'known');
 const admitted:string[]=[];
 for(const path of ['/private','/services'])if(pageAllowed(policy,'https://jobs.example'+path))admitted.push(path);
 assert.deepEqual(admitted,['/services']);
 const page=await fetchFixture(admitted[0]!);assert.equal(page.response.status,404);assert.deepEqual(page.response.body,pageBytes);
 assert.deepEqual(requests,['/robots.txt','/services']);
 const frozen=await ledger.freeze(p,site,await ledger.cutoff(p,site),evidence,observations);
 const runId=await commands.submit(p,site,randomUUID(),budget());await commands.enqueue(p,site,runId,frozen,digest,randomUUID(),'project');
 const lease=(await worker.claim())!;assert.ok(lease);
 const snapshotId=await new Jobs(scheduler,deletions,blobs).projectHttpFixture(lease,page.accepted.observationId);
 const reopened=new pg.Pool({...cfg,user:'aios_runtime'});t.after(()=>reopened.end());
 const persisted=new Ledger(reopened,blobs,'local-synthetic-v1');
 assert.deepEqual(await persisted.artifact(p,site,page.accepted.bodyEvidenceId!),pageBytes);
 const receipt=JSON.parse((await persisted.artifact(p,site,page.accepted.receiptEvidenceId)).toString());
 assert.equal(receipt.status_code,page.response.status);assert.equal(receipt.body_evidence_id,page.accepted.bodyEvidenceId);
 const c=await reopened.connect();
 try{
  await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",[p.tenantId,p.userId]);await c.query("SELECT aios.authorize('read',$1)",[site]);
  const stored=(await c.query('SELECT * FROM aios.page_snapshot WHERE id=$1',[snapshotId])).rows[0];
  assert.equal(stored.observation_id,page.accepted.observationId);assert.equal(stored.status_code,String(receipt.status_code));assert.equal(stored.crawl_id,runId);assert.equal(stored.truncated,false);
  assert.equal((await c.query('SELECT state,result_ref FROM aios.job WHERE job_id=$1',[lease.jobId])).rows[0].result_ref,snapshotId);
  await c.query('COMMIT');
 }finally{await c.query('ROLLBACK');c.release();}
 await stopAll();
});
test('M2 deletion tombstone survives a stale database epoch and blocks acceptance',async()=>{
 const projected=await projectionFixture();await commands.cancel(p,site,projected.lease.runId);
 await run();const l=(await worker.claim())!;await deletions.record(p.tenantId,site);
 await assert.rejects(new Jobs(scheduler,deletions,blobs).projectHttpFixture(projected.lease,projected.receipt.observationId),/deleted_scope/);
 await assert.rejects(worker.complete(l,bundle),/deleted_scope/);await assert.rejects(commands.submit(p,site,randomUUID(),budget()),/deleted_scope/);
 // No database deletion/epoch update happened: independently retained tombstone alone fences an older DB.
 assert.equal((await admin.query('SELECT deletion_epoch FROM aios.tenant WHERE id=$1',[p.tenantId])).rows[0].deletion_epoch,'0');await stopAll();
});
