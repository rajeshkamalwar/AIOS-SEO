import { FixtureLinkFrontier } from '../packages/jobs/frontier-links.js';
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
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_frontier_links_test'};
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
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_frontier_links_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);runtime=new pg.Pool({...cfg,user:'aios_runtime',max:3});
 for(const person of [p,other])await fixture('Tenant',{id:person.tenantId});
 for(const person of [p,other,peer]){await fixture('User',{id:person.userId,subject:person.userId});await fixture('Membership',{id:randomUUID(),tenant_id:person.tenantId,user_id:person.userId});}
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'frontier-links-blobs'),'local-synthetic-v1');deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'frontier-links-deletions'));
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

async function http(path:string,body:string,status=200,capturedAt=new Date(Date.now()-1000).toISOString(),mime?:string){
 const url='https://frontier.example'+path;
 return ledger.acceptHttpFixture(p,site,{attemptId:randomUUID(),capturedAt},{url,final_url:url,method:'GET',status_code:status,headers:[{name:'content-type',value:mime??(path.endsWith('.xml')?'application/xml':path.endsWith('.txt')?'text/plain':'text/html')}],truncated:false,error:null},Buffer.from(body));
}
async function setup(paths=['/services','/private','/b','/a'],robots='User-agent: *\nDisallow: /private\n',sitemapPath='/sitemap.xml'){
 const crawl=await run(),scope=await ledger.acceptSiteScopeFixture(p,site,crawl,deletions),r=await http('/robots.txt',robots),s=await http(sitemapPath,'<urlset>'+paths.map(x=>'<url><loc>https://frontier.example'+x+'</loc></url>').join('')+'</urlset>');
 const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[scope.evidenceId,r.receiptEvidenceId,r.bodyEvidenceId!,s.receiptEvidenceId,s.bodyEvidenceId!],[scope.observationId,r.observationId,s.observationId]);
 return {crawl,scope,r,s,bundle,call:()=>frontier().discoverSitemap(p,site,crawl,bundle,s.observationId,r.observationId)};
}

// Migration-owner snapshots isolate discovery storage tests. The composed Jobs
// suite additionally exercises the real fenced projector before link discovery.
async function snapshot(crawl:string,html:string,path='/',changes:Record<string,unknown>={},mime='text/html'){
 const raw=await http(path,html,200,new Date(Date.now()-1000).toISOString(),mime),e=(await admin.query('SELECT * FROM aios.evidence WHERE id=$1',[raw.bodyEvidenceId])).rows[0],o=(await admin.query('SELECT * FROM aios.observation WHERE id=$1',[raw.observationId])).rows[0];
 const at=new Date().toISOString(),common={id:randomUUID(),schema_version:1,version:1,created_at:at,recorded_at:at,updated_at:at,deleted_at:null,provenance_ids:[],tenant_id:p.tenantId,site_id:site,knowledge_seq:Number(o.knowledge_seq)};
 let page=(await admin.query('SELECT * FROM aios.page WHERE tenant_id=$1 AND site_id=$2 AND url=$3',[p.tenantId,site,e.source_uri])).rows[0];
 async function insert(type:string,table:string,row:Record<string,unknown>){validate(base+'domain.schema.json#/$defs/'+type,row);const entries=Object.entries(row).filter(([k])=>k!=='provenance_ids');await admin.query(`INSERT INTO aios.${table} (${entries.map(([k])=>k).join(',')}) VALUES (${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));}
 if(!page){page={...common,record_type:'Page',state:'active',retention_class:'derived',url:e.source_uri,url_key:e.source_uri,page_type:'unknown',type_support:{source_applicability:'uncertain',integrity:'verified',coverage:'unknown',identity:'provisional',inference:'unknown',reasons:[]}};await insert('Page','page',page);}
 const row={...common,id:randomUUID(),record_type:'PageSnapshot',state:'captured',retention_class:'raw',series_id:randomUUID(),valid_from:null,valid_to:null,superseded_at:null,superseded_seq:null,page_id:page.id,crawl_id:crawl,observation_id:o.id,evidence_id:e.id,observed_at:o.observed_at.toISOString(),status_code:200,content_hash:e.sha256,main_text_hash:null,truncated:false,...changes};await insert('PageSnapshot','page_snapshot',row);return {raw,id:row.id};
}
async function links(html:string,paths=['/services'],changes:Record<string,unknown>={}){
 const f=await setup(paths);await f.call();const sn=await snapshot(f.crawl,html,'/',changes);
 const evidence=[f.scope.evidenceId,f.r.receiptEvidenceId,f.r.bodyEvidenceId!,sn.raw.receiptEvidenceId,sn.raw.bodyEvidenceId!];const observations=[f.scope.observationId,f.r.observationId,sn.raw.observationId];
 const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),evidence,observations);
 return {...f,sn,bundle,evidence,observations,call:()=>new FixtureLinkFrontier(runtime,deletions,blobs).discoverLinks(p,site,f.crawl,bundle,sn.id,f.r.observationId)};
}
test('raw anchors produce same-origin durable children with exact byte locators and parent lineage',async()=>{
 const html='<html><head><link rel="canonical" href="/not-a-link"></head><body><a href="/child">🧠</a><a href="/private">private</a><a href="https://other.example/out">out</a><a href="/logout">action</a><a href="/x?token=secret">secret</a><script>"<a href=/fake>"</script></body></html>';
 const f=await links(html),result=await f.call();assert.equal(result.state,'discovered');if(result.state!=='discovered')return;assert.equal(result.counts.inserted_count,2);assert.equal(result.counts.source_excluded.outOfScope,1);assert.equal(result.counts.source_excluded.action+result.counts.source_excluded.invalid,2);
 const rows=(await admin.query("SELECT * FROM aios.crawl_target WHERE crawl_id=$1 AND seed_kind='link' ORDER BY url",[f.crawl])).rows;assert.equal(rows.length,2);assert.ok(rows.every(x=>Number(x.depth)===1&&x.url_key===x.url&&x.discovered_from_id));assert.equal(rows[0].admitted,true);assert.equal(rows[1].reason,'robots_denied');
 const batch=(await admin.query('SELECT * FROM aios.fixture_link_batch WHERE crawl_id=$1',[f.crawl])).rows[0];for(const candidate of batch.sources){assert.equal(candidate.source.evidence_id,f.sn.raw.bodyEvidenceId);assert.equal(candidate.source.sha256,hash(Buffer.from(html)));const [,start,end]=candidate.source.locator.split(':');assert.match(Buffer.from(html).subarray(Number(start),Number(end)).toString(),/^href=/);}
 assert.equal((await admin.query('SELECT * FROM aios.record_link WHERE owner_id=$1',[rows[0].id])).rowCount,4);assert.deepEqual(await f.call(),result);
 await runtime.end();await admin.end();assert.ok(process.env.AIOS_TEST_DATA!.startsWith('/tmp/aios-m1-'));execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',process.env.AIOS_TEST_DATA!,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart']);admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);assert.deepEqual(await f.call(),result);
});
test('link budgets include existing sitemap targets and preserve query-order identities',async()=>{
 const f=await links(Array.from({length:25},(_,i)=>'<a href="/q?v='+i+'">q</a>').join('')+Array.from({length:30},(_,i)=>'<a href="/z'+i+'">z</a>').join(''),Array.from({length:490},(_,i)=>'/p'+i));const result=await f.call();assert.equal(result.state,'discovered');if(result.state!=='discovered')return;assert.equal(result.counts.admitted_count,500);assert.equal(result.counts.excluded_count,5);assert.equal(result.counts.deferred_count,41);
});
test('partial raw snapshots abstain and unadmitted/foreign parents fail closed',async()=>{
 const f=await links('<a href="/new">n</a>',[],{state:'partial',truncated:true});assert.deepEqual(await f.call(),{state:'not_discovered',reason:'incomplete_raw_snapshot'});
 const g=await links('<a href="/new">n</a>');await admin.query("UPDATE aios.crawl_target SET admitted=false,state='discovered' WHERE crawl_id=$1 AND seed_kind='submitted'",[g.crawl]);await assert.rejects(g.call(),/parent_unavailable/);
 await assert.rejects(new FixtureLinkFrontier(runtime,deletions,blobs).discoverLinks(other,otherSite,g.crawl,g.bundle,g.sn.id,g.r.observationId),/scope_denied/);
});
test('depth limit prevents expansion; active policy, membership and tombstones remain current',async()=>{
 const f=await links('<a href="/new">n</a>');await admin.query("UPDATE aios.crawl_target SET depth=6 WHERE crawl_id=$1 AND seed_kind='submitted'",[f.crawl]);assert.deepEqual(await f.call(),{state:'not_discovered',reason:'depth_budget'});
 await admin.query("UPDATE aios.crawl_target SET depth=0 WHERE crawl_id=$1 AND seed_kind='submitted'",[f.crawl]);await admin.query('UPDATE control.health SET restore_ready=false');await assert.rejects(f.call(),/policy_unavailable/);await admin.query('UPDATE control.health SET restore_ready=true');await jobs.cancel(p,site,f.crawl);await assert.rejects(f.call(),/run_fenced/);
});
test('base resolution affects anchors but never admits canonical or base declarations themselves',async()=>{
 const f=await links('<base href="/directory/"><link rel="canonical" href="/canonical"><a href="child">c</a>');await f.call();const rows=(await admin.query("SELECT url FROM aios.crawl_target WHERE crawl_id=$1 AND seed_kind='link'",[f.crawl])).rows;assert.deepEqual(rows.map(x=>x.url),['https://frontier.example/directory/child']);
});
test('changed private bytes reject and outbox failure rolls back links and locator batches',async()=>{
 const f=await links('<a href="/new">n</a>'),read=blobs.read.bind(blobs);blobs.read=async(...args)=>Buffer.concat([await read(...args),Buffer.from('x')]);try{await assert.rejects(f.call(),/artifact_integrity_failed/);}finally{blobs.read=read;}
 await admin.query("CREATE FUNCTION aios.fail_link_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'event_failed'; END $$; CREATE TRIGGER fail_link_event BEFORE INSERT ON aios.outbox FOR EACH ROW EXECUTE FUNCTION aios.fail_link_event()");try{await assert.rejects(f.call(),/event_failed/);}finally{await admin.query('DROP TRIGGER fail_link_event ON aios.outbox; DROP FUNCTION aios.fail_link_event()');}
 assert.equal((await admin.query('SELECT * FROM aios.fixture_link_batch WHERE crawl_id=$1',[f.crawl])).rowCount,0);assert.equal((await admin.query("SELECT * FROM aios.crawl_target WHERE crawl_id=$1 AND seed_kind='link'",[f.crawl])).rowCount,0);await assert.rejects(runtime.query('DELETE FROM aios.fixture_link_batch'),/permission denied/);assert.equal((await runtime.query('SELECT * FROM aios.fixture_link_batch')).rowCount,0);
});
test('direct SQL rejects forged locator support before accepting link candidates',async()=>{
 const {transaction,scope}=await import('../packages/persistence/transaction.js'),f=await links('<a href="/new">n</a>'),e=(await admin.query('SELECT * FROM aios.evidence WHERE id=$1',[f.sn.raw.bodyEvidenceId])).rows[0];
 const valid={evidence_id:e.id,sha256:e.sha256,locator:'bytes:3:14',parser_version:'parse5@8.0.1/aios-html-extract-v1'};
 for(const source of [null,'bad',{...valid,evidence_id:randomUUID()},{...valid,sha256:'0'.repeat(64)},{...valid,locator:'bytes:0:999999'},{...valid,locator:'bytes:5:4'},{...valid,parser_version:'invented'},{...valid,extra:true}]){
  await assert.rejects(transaction(runtime,'aios_runtime',async c=>{await scope(c,p,site);await c.query('SELECT control.discover_fixture_links($1,$2,$3,$4,$5,$6,$7)',[f.crawl,f.bundle,f.sn.id,f.r.observationId,'a'.repeat(64),JSON.stringify([{url:'https://frontier.example/new',priority:3,allowed:true,source}]),'{}']);}),/source_locator_invalid/);
 }
 assert.equal((await admin.query('SELECT * FROM aios.fixture_link_batch WHERE crawl_id=$1',[f.crawl])).rowCount,0);
});
test('sitemap and link paths cannot replace the run robots context',async()=>{
 const f=await links('<a href="/new">n</a>');await f.call();const r=await http('/robots.txt','User-agent: *\nDisallow: /\n');
 const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[...f.evidence,r.receiptEvidenceId,r.bodyEvidenceId!,f.s.receiptEvidenceId,f.s.bodyEvidenceId!],[...f.observations,r.observationId,f.s.observationId]);
 await assert.rejects(frontier().discoverSitemap(p,site,f.crawl,bundle,f.s.observationId,r.observationId),/robots_context_conflict/);
 await assert.rejects(new FixtureLinkFrontier(runtime,deletions,blobs).discoverLinks(p,site,f.crawl,bundle,f.sn.id,r.observationId),/robots_context_conflict/);
});
test('current health is rechecked after private reads before parser output can become targets',async()=>{
 const f=await links('<a href="/new">n</a>'),read=blobs.read.bind(blobs);let reads=0;
 blobs.read=async(...args)=>{const value=await read(...args);if(++reads===5){await admin.query("UPDATE control.health SET verified_until=clock_timestamp()+interval '5 milliseconds'");await new Promise(resolve=>setTimeout(resolve,25));}return value;};
 try{await assert.rejects(f.call(),/policy_unavailable/);}finally{blobs.read=read;}
 assert.equal((await admin.query('SELECT * FROM aios.fixture_link_batch WHERE crawl_id=$1',[f.crawl])).rowCount,0);
});

test('XHTML abstains with explicit parser limitation and never fabricates no-link coverage',async()=>{
 const f=await setup([]);await f.call();const sn=await snapshot(f.crawl,'<html xmlns="http://www.w3.org/1999/xhtml"><a href="/new">n</a></html>','/',{},'application/xhtml+xml');
 const bundle=await ledger.freeze(p,site,await ledger.cutoff(p,site),[f.scope.evidenceId,f.r.receiptEvidenceId,f.r.bodyEvidenceId!,sn.raw.receiptEvidenceId,sn.raw.bodyEvidenceId!],[f.scope.observationId,f.r.observationId,sn.raw.observationId]);
 assert.deepEqual(await new FixtureLinkFrontier(runtime,deletions,blobs).discoverLinks(p,site,f.crawl,bundle,sn.id,f.r.observationId),{state:'not_discovered',reason:'xml_parser_required'});
 assert.equal((await admin.query('SELECT * FROM aios.fixture_link_batch WHERE crawl_id=$1',[f.crawl])).rowCount,0);
});
