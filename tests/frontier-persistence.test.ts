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
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_frontier_test'};
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
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_frontier_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);runtime=new pg.Pool({...cfg,user:'aios_runtime',max:3});
 for(const person of [p,other])await fixture('Tenant',{id:person.tenantId});
 for(const person of [p,other,peer]){await fixture('User',{id:person.userId,subject:person.userId});await fixture('Membership',{id:randomUUID(),tenant_id:person.tenantId,user_id:person.userId});}
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'frontier-blobs'),'local-synthetic-v1');deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'frontier-deletions'));
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
test('retained scope, sitemap and robots produce durable deterministic full-URL targets with immutable provenance',async()=>{
 const f=await setup(),result=await f.call();assert.equal(result.discovered_count,5);assert.equal(result.admitted_count,4);assert.equal(result.excluded_count,1);
 const rows=(await admin.query('SELECT * FROM aios.crawl_target WHERE crawl_id=$1 ORDER BY priority,url_key',[f.crawl])).rows;
 assert.equal(rows[0].url,'https://frontier.example/');assert.ok(rows.every(x=>x.url_key===x.url&&Number(x.depth)===0));assert.equal(rows.find(x=>x.url.endsWith('/private')).reason,'robots_denied');
 for(const row of rows){assert.equal((await admin.query('SELECT * FROM aios.record_link WHERE owner_id=$1',[row.id])).rowCount,3);}
 assert.deepEqual(await f.call(),result);assert.equal((await admin.query('SELECT * FROM aios.fixture_frontier_batch WHERE crawl_id=$1',[f.crawl])).rowCount,1);
 await assert.rejects(runtime.query('INSERT INTO aios.crawl_target DEFAULT VALUES'),/permission denied/);
 assert.equal((await runtime.query('SELECT * FROM aios.fixture_frontier_batch')).rowCount,0);
 await runtime.end();await admin.end();assert.ok(process.env.AIOS_TEST_DATA!.startsWith('/tmp/aios-m1-'));
 execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',process.env.AIOS_TEST_DATA!,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart']);
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);
 assert.deepEqual(await f.call(),result);assert.equal((await admin.query('SELECT * FROM aios.crawl_target WHERE crawl_id=$1',[f.crawl])).rowCount,5);
});
test('robots denies submitted seed without denying allowed sitemap candidates',async()=>{
 const f=await setup(['/services'],'User-agent: *\nDisallow: /$\n');const result=await f.call();assert.equal(result.admitted_count,1);
 const seed=(await admin.query("SELECT * FROM aios.crawl_target WHERE crawl_id=$1 AND seed_kind='submitted'",[f.crawl])).rows[0];assert.equal(seed.reason,'robots_denied');assert.equal(seed.admitted,false);
 assert.equal((await admin.query('SELECT * FROM aios.record_link WHERE owner_id=$1',[seed.id])).rowCount,3);
});
test('query variants and admission budgets remain cumulative, with exact query order identity',async()=>{
 const paths=[...Array.from({length:25},(_,i)=>'/q?v='+i),...Array.from({length:520},(_,i)=>'/p'+String(i).padStart(4,'0')),'/ordered?a=1&amp;b=2','/ordered?b=2&amp;a=1'];
 const f=await setup(paths),result=await f.call();assert.equal(result.admitted_count,500);assert.equal(result.excluded_count,5);assert.equal(result.deferred_count,43);
 const rows=(await admin.query("SELECT url FROM aios.crawl_target WHERE crawl_id=$1 AND url LIKE '%ordered%'",[f.crawl])).rows;assert.equal(rows.length,2);assert.notEqual(rows[0].url,rows[1].url);
 assert.deepEqual(await f.call(),result);
});
test('scope membership, current permissions, cancellation and health are checked even for retries',async()=>{
 const f=await setup();await assert.rejects(frontier().discoverSitemap(peer,site,f.crawl,f.bundle,f.s.observationId,f.r.observationId),/scope_denied/);
 await assert.rejects(frontier().discoverSitemap(other,otherSite,f.crawl,f.bundle,f.s.observationId,f.r.observationId),/scope_denied/);
 const empty=await ledger.freeze(p,site,await ledger.cutoff(p,site),[],[]);await assert.rejects(frontier().discoverSitemap(p,site,f.crawl,empty,f.s.observationId,f.r.observationId),/bundle_membership_required/);
 await f.call();await admin.query('UPDATE control.health SET restore_ready=false');await assert.rejects(f.call(),/policy_unavailable/);await admin.query('UPDATE control.health SET restore_ready=true');
 await jobs.cancel(p,site,f.crawl);await assert.rejects(f.call(),/run_fenced/);
});
test('unrelated sitemap source and altered blob fail closed',async()=>{
 const f=await setup(['/a'],'User-agent: *\n','/arbitrary.xml');await assert.rejects(f.call(),/sitemap_source_invalid/);
 const g=await setup();const read=blobs.read.bind(blobs);blobs.read=async(...args)=>Buffer.concat([await read(...args),Buffer.from('changed')]);try{await assert.rejects(g.call(),/artifact_integrity_failed/);}finally{blobs.read=read;}
 assert.equal((await admin.query('SELECT * FROM aios.fixture_frontier_batch WHERE crawl_id=$1',[g.crawl])).rowCount,0);
});
test('outbox failure rolls back frontier rows and provenance atomically',async()=>{
 const f=await setup();await admin.query("CREATE FUNCTION aios.fail_frontier_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'event_failed'; END $$; CREATE TRIGGER fail_frontier_event BEFORE INSERT ON aios.outbox FOR EACH ROW EXECUTE FUNCTION aios.fail_frontier_event()");
 try{await assert.rejects(f.call(),/event_failed/);}finally{await admin.query('DROP TRIGGER fail_frontier_event ON aios.outbox; DROP FUNCTION aios.fail_frontier_event()');}
 assert.equal((await admin.query('SELECT * FROM aios.crawl_target WHERE crawl_id=$1',[f.crawl])).rowCount,1);assert.equal((await admin.query('SELECT * FROM aios.fixture_frontier_batch WHERE crawl_id=$1',[f.crawl])).rowCount,0);
});

test('document budget is durable across twenty receipts and idempotent retry does not consume it',async()=>{
 const f=await setup();await f.call();
 for(let i=1;i<21;i++){
  const s=await http('/sitemap.xml','<urlset><url><loc>https://frontier.example/doc'+i+'</loc></url></urlset>');
  const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[f.scope.evidenceId,f.r.receiptEvidenceId,f.r.bodyEvidenceId!,s.receiptEvidenceId,s.bodyEvidenceId!],[f.scope.observationId,f.r.observationId,s.observationId]);
  const call=()=>frontier().discoverSitemap(p,site,f.crawl,bundle,s.observationId,f.r.observationId);
  if(i===20)await assert.rejects(call(),/sitemap_budget/);else await call();
 }
 assert.equal((await admin.query('SELECT * FROM aios.fixture_frontier_batch WHERE crawl_id=$1',[f.crawl])).rowCount,20);await f.call();
});
test('unsupported index, old robots and oversized robots abstain before admitting seed',async()=>{
 for(const kind of ['index','old','oversize']){
  const crawl=await run(),sc=await ledger.acceptSiteScopeFixture(p,site,crawl,deletions);
  const r=await http('/robots.txt',kind==='oversize'?'#'.repeat(512001):'User-agent: *\n',200,kind==='old'?new Date(Date.now()-25*3600000).toISOString():new Date(Date.now()-1000).toISOString());
  const s=await http('/sitemap.xml',kind==='index'?'<sitemapindex><sitemap><loc>https://frontier.example/child.xml</loc></sitemap></sitemapindex>':'<urlset/>');
  const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[sc.evidenceId,r.receiptEvidenceId,r.bodyEvidenceId!,s.receiptEvidenceId,s.bodyEvidenceId!],[sc.observationId,r.observationId,s.observationId]);
  await assert.rejects(frontier().discoverSitemap(p,site,crawl,bundle,s.observationId,r.observationId),/sitemap_index_unsupported|robots_unavailable|source_unavailable/);
  assert.equal((await admin.query('SELECT * FROM aios.crawl_target WHERE crawl_id=$1 AND admitted',[crawl])).rowCount,0);
 }
});
test('SQL guard rejects missing booleans and null candidate structures without writing targets',async()=>{
 const {transaction,scope}=await import('../packages/persistence/transaction.js');const f=await setup();
 for(const [candidates,exclusions] of [[[{url:'https://frontier.example/injected',priority:1,other:true}],{}],[null,{}],[[],null]]){
  await assert.rejects(transaction(runtime,'aios_runtime',async c=>{await scope(c,p,site);await c.query('SELECT control.discover_fixture_sitemap($1,$2,$3,$4,$5,$6,$7)',[f.crawl,f.bundle,f.s.observationId,f.r.observationId,'a'.repeat(64),JSON.stringify(candidates),JSON.stringify(exclusions)]);}),/schema_invalid/);
 }
 assert.equal((await admin.query('SELECT * FROM aios.crawl_target WHERE crawl_id=$1',[f.crawl])).rowCount,1);assert.equal((await admin.query('SELECT * FROM aios.fixture_frontier_batch WHERE crawl_id=$1',[f.crawl])).rowCount,0);
});
test('health expiry during private artifact reads rejects all frontier mutation',async()=>{
 const f=await setup(),read=blobs.read.bind(blobs);let expired=false;
 blobs.read=async(...args)=>{const bytes=await read(...args);if(!expired){expired=true;await admin.query("UPDATE control.health SET verified_until=clock_timestamp()+interval '5 milliseconds'");await new Promise(resolve=>setTimeout(resolve,20));}return bytes;};
 try{await assert.rejects(f.call(),/policy_unavailable/);}finally{blobs.read=read;}
 assert.equal((await admin.query('SELECT * FROM aios.crawl_target WHERE crawl_id=$1',[f.crawl])).rowCount,1);
});
test('observation expiry during artifact reads and future observations cannot authorize admission',async()=>{
 for(const future of [false,true]){
  const crawl=await run(),sc=await ledger.acceptSiteScopeFixture(p,site,crawl,deletions);
  const capturedAt=new Date(Date.now()+(future?10000:-86400000+2000)).toISOString();
  if(future){await assert.rejects(http('/robots.txt','User-agent: *\n',200,capturedAt),/future_observation/);continue;}
  const r=await http('/robots.txt','User-agent: *\n',200,capturedAt),s=await http('/sitemap.xml','<urlset/>');
  const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[sc.evidenceId,r.receiptEvidenceId,r.bodyEvidenceId!,s.receiptEvidenceId,s.bodyEvidenceId!],[sc.observationId,r.observationId,s.observationId]);
  const read=blobs.read.bind(blobs);let reads=0;
  blobs.read=async(...args)=>{const bytes=await read(...args);if(!future&&++reads===5){await new Promise(resolve=>setTimeout(resolve,2100));}return bytes;};
  try{await assert.rejects(frontier().discoverSitemap(p,site,crawl,bundle,s.observationId,r.observationId),/source_unavailable/);}finally{blobs.read=read;}
  assert.equal((await admin.query('SELECT * FROM aios.crawl_target WHERE crawl_id=$1 AND admitted',[crawl])).rowCount,0);
 }
});
