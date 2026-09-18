import { test,before,after,afterEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ledger,type Principal,sweepOrphans } from '../packages/persistence/index.js';
import { LocalBlobs } from '../packages/evidence/index.js';
import { DeletionLedger } from '../packages/policy/deletion.js';
import { FixtureFrontier } from '../packages/jobs/frontier.js';
import { execFileSync } from 'node:child_process';
import { Jobs } from '../packages/jobs/index.js';
import { migrate } from '../packages/persistence/migrate.js';
import { base,validate,hash,canonical } from '../packages/contracts/index.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_sitemap_index_test'};
const p:Principal={tenantId:randomUUID(),userId:randomUUID()},other:Principal={tenantId:randomUUID(),userId:randomUUID()},peer:Principal={tenantId:p.tenantId,userId:randomUUID()};
let admin:pg.Pool,runtime:pg.Pool,ledger:Ledger,blobs:LocalBlobs,deletions:DeletionLedger,jobs:Jobs,site:string,otherSite:string;
const frontier=()=>new FixtureFrontier(runtime,deletions,blobs);
async function fixture(type:string,changes:Record<string,unknown>){
 const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes};validate(base+'domain.schema.json#/$defs/'+type,row);
 const table=({Tenant:'tenant',User:'app_user',Membership:'membership'} as Record<string,string>)[type],entries=Object.entries(row).filter(([k])=>!['provenance_ids','site_scope_ids'].includes(k));
 await admin.query(`INSERT INTO aios.${table} (${entries.map(([k])=>k).join(',')}) VALUES(${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));
}
const run=(person=p,wantedSite=site)=>jobs.submit(person,wantedSite,randomUUID(),{http_requests:10,render_requests:0,render_pages:0,model_calls:0,tokens:0,cost_microusd:0,deadline:new Date(Date.now()+600000).toISOString()});
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_sitemap_index_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);runtime=new pg.Pool({...cfg,user:'aios_runtime',max:3});
 for(const person of [p,other])await fixture('Tenant',{id:person.tenantId});
 for(const person of [p,other,peer]){await fixture('User',{id:person.userId,subject:person.userId});await fixture('Membership',{id:randomUUID(),tenant_id:person.tenantId,user_id:person.userId});}
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'sitemap-index-blobs'),'local-synthetic-v1');deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'sitemap-index-deletions'));
 ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);
 site=await ledger.registerSite(p,'https://frontier.example/');otherSite=await ledger.registerSite(other,'https://frontier.example/');
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");
 for(const person of [p,other])for(const kind of ['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'])await admin.query('INSERT INTO control.tenant_cap VALUES($1,$2,10000)',[person.tenantId,kind]);
});
afterEach(async()=>{
 if(!admin)return;
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");
 for(const r of (await admin.query("SELECT tenant_id,site_id,id FROM aios.crawl WHERE state IN ('queued','running','blocked')")).rows)await jobs.cancel(r.tenant_id===p.tenantId?p:other,r.site_id,r.id);
});
after(async()=>{await runtime?.end();await admin?.end();});

async function http(path:string,body:string,status=200,capturedAt=new Date(Date.now()-1000).toISOString()){
 const url='https://frontier.example'+path;
 return ledger.acceptHttpFixture(p,site,{attemptId:randomUUID(),capturedAt},{url,final_url:url,method:'GET',status_code:status,headers:[{name:'content-type',value:path.endsWith('.xml')?'application/xml':'text/plain'}],truncated:false,error:null},Buffer.from(body));
}
async function setup(paths=['/services','/private','/b','/a'],robots='User-agent: *\nDisallow: /private\n',sitemapPath='/sitemap.xml'){
 const crawl=await run(),scope=await ledger.acceptSiteScopeFixture(p,site,crawl,deletions),r=await http('/robots.txt',robots),s=await http(sitemapPath,'<urlset>'+paths.map(x=>'<url><loc>https://frontier.example'+x+'</loc></url>').join('')+'</urlset>');
 const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[scope.evidenceId,r.receiptEvidenceId,r.bodyEvidenceId!,s.receiptEvidenceId,s.bodyEvidenceId!],[scope.observationId,r.observationId,s.observationId]);
 return {crawl,scope,r,s,bundle,call:()=>frontier().discoverSitemap(p,site,crawl,bundle,s.observationId,r.observationId)};
}

async function start(){const crawl=await run(),sc=await ledger.acceptSiteScopeFixture(p,site,crawl,deletions),robots=await http('/robots.txt','User-agent: *\nDisallow: /denied\n');return {crawl,sc,robots,receipts:[] as Awaited<ReturnType<typeof http>>[]};}
async function document(f:Awaited<ReturnType<typeof start>>,path:string,body:string,parents=true){
 const receipt=await http(path,body);const sources=parents?[...f.receipts,receipt]:[receipt];
 const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[f.sc.evidenceId,f.robots.receiptEvidenceId,f.robots.bodyEvidenceId!,...sources.flatMap(x=>[x.receiptEvidenceId,x.bodyEvidenceId!])],[f.sc.observationId,f.robots.observationId,...sources.map(x=>x.observationId)]);
 return {receipt,bundle,call:()=>frontier().discoverSitemap(p,site,f.crawl,bundle,receipt.observationId,f.robots.observationId)};
}
const index=(paths:string[])=>'<sitemapindex>'+paths.map(p=>'<sitemap><loc>https://frontier.example'+p+'</loc></sitemap>').join('')+'</sitemapindex>';
const urls=(paths:string[])=>'<urlset>'+paths.map(p=>'<url><loc>https://frontier.example'+p+'</loc></url>').join('')+'</urlset>';
test('retained indexes admit only declared document sources, preserve chain evidence and survive restart',async()=>{
 const f=await start(),root=await document(f,'/sitemap.xml',index(['/child.xml','/denied.xml']));const first=await root.call();assert.equal(first.sitemap?.kind,'sitemapindex');assert.equal(first.sitemap?.eligible_count,1);assert.equal(first.discovered_count,1);f.receipts.push(root.receipt);
 const child=await document(f,'/child.xml',urls(['/page']));const result=await child.call();assert.equal(result.sitemap?.depth,1);assert.equal(result.discovered_count,2);
 const row=(await admin.query('SELECT * FROM aios.fixture_sitemap_document WHERE observation_id=$1',[child.receipt.observationId])).rows[0];assert.equal(row.parent_observation_id,root.receipt.observationId);assert.equal(row.body_evidence_id,child.receipt.bodyEvidenceId);
 assert.equal((await admin.query("SELECT * FROM aios.crawl_target WHERE crawl_id=$1 AND url LIKE '%.xml'",[f.crawl])).rowCount,0);
 await runtime.end();await admin.end();assert.ok(process.env.AIOS_TEST_DATA!.startsWith('/tmp/aios-m1-'));execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',process.env.AIOS_TEST_DATA!,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart']);admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);assert.deepEqual(await child.call(),result);assert.deepEqual(await root.call(),first);
});
test('depth2 retains deeper declarations as deferred without making them page targets',async()=>{
 const f=await start(),a=await document(f,'/sitemap.xml',index(['/one.xml']));await a.call();f.receipts.push(a.receipt);const b=await document(f,'/one.xml',index(['/two.xml']));await b.call();f.receipts.push(b.receipt);const c=await document(f,'/two.xml',index(['/three.xml','/sitemap.xml']));const r=await c.call();assert.equal(r.sitemap?.depth,2);assert.equal(r.sitemap?.depth_deferred_count,1);assert.equal(r.sitemap?.eligible_count,0);f.receipts.push(c.receipt);
 const d=await document(f,'/three.xml',urls(['/forbidden']));await assert.rejects(d.call(),/sitemap_source_invalid/);assert.equal((await admin.query('SELECT * FROM aios.crawl_target WHERE crawl_id=$1',[f.crawl])).rowCount,1);
 const duplicate=await document(f,'/sitemap.xml',index(['/one.xml']));await assert.rejects(duplicate.call(),/sitemap_document_conflict/);
});
test('child source needs pinned parent receipt/body/observation and current health',async()=>{
 const f=await start(),a=await document(f,'/sitemap.xml',index(['/child.xml']));await a.call();f.receipts.push(a.receipt);
 const child=await document(f,'/child.xml',urls(['/page']),false);await assert.rejects(child.call(),/bundle_membership_required/);
 const unrelated=await document(f,'/unrelated.xml',urls(['/page']));await assert.rejects(unrelated.call(),/sitemap_source_invalid/);
 const valid=await document(f,'/child.xml',urls(['/page']));await admin.query('UPDATE control.health SET restore_ready=false');await assert.rejects(valid.call(),/policy_unavailable/);await admin.query('UPDATE control.health SET restore_ready=true');await valid.call();
});
test('index and leaf batches share twenty-document budget without dispatching or resetting it',async()=>{
 const f=await start(),a=await document(f,'/sitemap.xml',index(Array.from({length:20},(_,i)=>'/d'+i+'.xml')));await a.call();f.receipts.push(a.receipt);
 for(let i=0;i<20;i++){const child=await document(f,'/d'+i+'.xml',urls(['/p'+i]));if(i===19)await assert.rejects(child.call(),/sitemap_budget/);else await child.call();}
 assert.equal((await admin.query('SELECT * FROM aios.fixture_sitemap_document WHERE crawl_id=$1',[f.crawl])).rowCount,20);assert.equal((await admin.query('SELECT * FROM aios.job WHERE crawl_id=$1',[f.crawl])).rowCount,0);
});
test('failed outbox rolls back index document, batch and target classification',async()=>{
 const f=await start(),a=await document(f,'/sitemap.xml',index(['/child.xml']));await admin.query("CREATE FUNCTION aios.fail_index_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'event_failed'; END $$; CREATE TRIGGER fail_index_event BEFORE INSERT ON aios.outbox FOR EACH ROW EXECUTE FUNCTION aios.fail_index_event()");try{await assert.rejects(a.call(),/event_failed/);}finally{await admin.query('DROP TRIGGER fail_index_event ON aios.outbox; DROP FUNCTION aios.fail_index_event()');}
 assert.equal((await admin.query('SELECT * FROM aios.fixture_sitemap_document WHERE crawl_id=$1',[f.crawl])).rowCount,0);assert.equal((await admin.query('SELECT * FROM aios.fixture_frontier_batch WHERE crawl_id=$1',[f.crawl])).rowCount,0);await assert.rejects(runtime.query('DELETE FROM aios.fixture_sitemap_document'),/permission denied/);
});
test('exact historical same-URL batch retries preserve legacy results without permitting new duplicate admission',async()=>{
 const {manifestHash}=await import('../packages/contracts/index.js');
 const f=await start(),a=await document(f,'/sitemap.xml',urls(['/first'])),b=await document(f,'/sitemap.xml',urls(['/second']));
 const exclusions={invalid:0,action:0,outOfScope:0,budget:0};
 const retained=[];
 // Migration-owner fixtures model the two immutable batches permitted before013.
 for(const [entry,path,count] of [[a,'/first',2],[b,'/second',3]] as const){
  const candidates=[{url:'https://frontier.example/',priority:0,allowed:true},{url:'https://frontier.example'+path,priority:2,allowed:true}];
  const digest=manifestHash({run:f.crawl,bundleId:entry.bundle,sitemapObservationId:entry.receipt.observationId,robotsObservationId:f.robots.observationId,scopeEvidence:f.sc.evidenceId,candidates,exclusions,policy:'discovery-v1'});
  const result={inserted_count:1,discovered_count:count,admitted_count:count,excluded_count:0,deferred_count:0,overflow_count:0,source_excluded:exclusions};
  await admin.query('INSERT INTO aios.fixture_frontier_batch VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp())',[p.tenantId,site,f.crawl,entry.receipt.observationId,f.robots.observationId,entry.bundle,digest,result]);retained.push(result);
 }
 assert.deepEqual(await a.call(),retained[0]);assert.deepEqual(await b.call(),retained[1]);
 const alteredBundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[f.sc.evidenceId,f.robots.receiptEvidenceId,f.robots.bodyEvidenceId!,a.receipt.receiptEvidenceId,a.receipt.bodyEvidenceId!],[f.sc.observationId,f.robots.observationId,a.receipt.observationId]);
 await assert.rejects(frontier().discoverSitemap(p,site,f.crawl,alteredBundle,a.receipt.observationId,f.robots.observationId),/conflict/);
 const third=await document(f,'/sitemap.xml',urls(['/third']));await assert.rejects(third.call(),/sitemap_document_conflict/);
 await admin.query('UPDATE control.health SET restore_ready=false');await assert.rejects(a.call(),/policy_unavailable/);await admin.query('UPDATE control.health SET restore_ready=true');
 assert.equal((await admin.query('SELECT * FROM aios.fixture_frontier_batch WHERE crawl_id=$1',[f.crawl])).rowCount,2);assert.equal((await admin.query('SELECT * FROM aios.fixture_sitemap_document WHERE crawl_id=$1',[f.crawl])).rowCount,0);
});
test('a rejected submitted target cannot be reclassified by sitemap interpretation',async()=>{
 const {transaction,scope,tick}=await import('../packages/persistence/transaction.js');
 const f=await start(),a=await document(f,'/sitemap.xml',urls(['/page']));const seed=(await admin.query("SELECT id FROM aios.crawl_target WHERE crawl_id=$1 AND seed_kind='submitted'",[f.crawl])).rows[0].id;
 await admin.query('ALTER ROLE aios_evaluator LOGIN');const evaluator=new pg.Pool({...cfg,user:'aios_evaluator'});
 try{await transaction(evaluator,'aios_evaluator',async c=>{
  await scope(c,p,site);const t=await tick(c,p.tenantId),id=randomUUID();
  const row={record_type:'SelfAuditResult',id,schema_version:2,version:1,created_at:t.recorded_at,recorded_at:t.recorded_at,updated_at:t.recorded_at,deleted_at:null,state:'recorded',retention_class:'audit',tenant_id:p.tenantId,site_id:site,crawl_id:f.crawl,check_id:'A02',check_version:'1.1.0',result:'fail',effect:'reject_outputs',reason:'independent seed restriction',knowledge_seq:t.knowledge_seq,scope:'outputs',scope_complete:true,dependency_snapshot_hash:'0'.repeat(64),recovery_of_id:null};
  const entries=Object.entries(row);await c.query(`INSERT INTO self_audit_result (${entries.map(([k])=>k).join(',')}) VALUES (${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));await c.query('INSERT INTO audit_impact VALUES($1,$2,$3,$4,true)',[p.tenantId,site,id,seed]);
 });}finally{await evaluator.end();}
 await assert.rejects(a.call(),/audit_input_rejected/);assert.equal((await admin.query('SELECT admitted FROM aios.crawl_target WHERE id=$1',[seed])).rows[0].admitted,false);assert.equal((await admin.query('SELECT * FROM aios.fixture_frontier_batch WHERE crawl_id=$1',[f.crawl])).rowCount,0);
});
