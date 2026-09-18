import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { base, validate, hash } from '../packages/contracts/index.js';
import { migrate } from '../packages/persistence/migrate.js';

// Migration-owner fixtures exercise storage only. This is deliberately not a
// worker result acceptance adapter: no unleased result can enter these tables.
type Row = Record<string, unknown>;
const cfg = {host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_perception_storage_test'};
let admin: pg.Pool, runtime: pg.Pool;
const tables: Record<string,string> = {Tenant:'tenant',User:'app_user',Site:'site',Crawl:'crawl',Page:'page',CrawlTarget:'crawl_target',PageSnapshot:'page_snapshot',Evidence:'evidence',Observation:'observation'};
const ta=randomUUID(),tb=randomUUID(),sa=randomUUID(),sb=randomUUID(),sc=randomUUID(),user=randomUUID();
let crawl:Row, otherCrawl:Row, page:Row, target:Row, snapshot:Row;
function common(type:string,tenant=ta,site=sa):Row {
 const at=new Date().toISOString();
 return {record_type:type,id:randomUUID(),schema_version:1,version:1,created_at:at,recorded_at:at,updated_at:at,deleted_at:null,provenance_ids:[],tenant_id:tenant,site_id:site,knowledge_seq:1};
}
async function insert(row:Row) {
 const type=String(row.record_type),table=tables[type];assert.ok(table);
 validate(base+'domain.schema.json#/$defs/'+type,row);
 const entries=Object.entries(row).filter(([k])=>!['provenance_ids','evidence_ids'].includes(k));
 await admin.query(`INSERT INTO aios.${table} (${entries.map(([k])=>k).join(',')}) VALUES (${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));
}
async function fixture(type:string,changes:Row) {
 const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes};
 await insert(row);return row;
}
async function scoped(tenant:string, fn:(c:pg.PoolClient)=>Promise<void>) {
 const c=await runtime.connect();
 try {await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);await fn(c);await c.query('COMMIT');}
 catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});
 await setup.query('CREATE DATABASE aios_perception_storage_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 runtime=new pg.Pool({...cfg,user:'aios_runtime',max:1});
 await fixture('Tenant',{id:ta});await fixture('Tenant',{id:tb});await fixture('User',{id:user,subject:user});
 await fixture('Site',{id:sa,site_id:sa,tenant_id:ta,business_id:null});
 await fixture('Site',{id:sb,site_id:sb,tenant_id:tb,business_id:null});
 await fixture('Site',{id:sc,site_id:sc,tenant_id:ta,business_id:null,normalized_origin:'https://second.example',submitted_url:'https://second.example/',origins:['https://second.example']});
 crawl={...common('Crawl'),state:'queued',retention_class:'operations',submitted_by:user,policy_version:'discovery-v1',input_hash:hash(Buffer.from('fixture')),idempotency_key:randomUUID(),stage:'validating',budget:{http_requests:10,render_requests:0,render_pages:0,model_calls:0,tokens:0,cost_microusd:0,deadline:new Date(Date.now()+600000).toISOString()},started_at:null,completed_at:null,completion_reason:null};
 await insert(crawl);otherCrawl={...crawl,id:randomUUID(),idempotency_key:randomUUID()};await insert(otherCrawl);
 target={...common('CrawlTarget'),state:'discovered',retention_class:'operations',crawl_id:crawl.id,url:'https://orange.example/',url_key:'https://orange.example/',depth:0,seed_kind:'submitted',discovered_from_id:null,admitted:false,priority:0,attempts:0,reason:null};await insert(target);
 page={...common('Page'),state:'active',retention_class:'derived',url:'https://orange.example/',url_key:'https://orange.example/',page_type:'unknown',type_support:{source_applicability:'uncertain',integrity:'unverified',coverage:'unknown',identity:'provisional',inference:'unknown',reasons:[]}};await insert(page);
 const eid=randomUUID(),oid=randomUUID();
 const evidence=await fixture('Evidence',{id:eid,tenant_id:ta,site_id:sa,artifact_key:`${ta}/${sa}/${eid}`});
 await fixture('Observation',{id:oid,tenant_id:ta,site_id:sa,subject_id:page.id,attempt_id:randomUUID(),evidence_ids:[]});
 snapshot={...common('PageSnapshot'),state:'captured',retention_class:'raw',series_id:randomUUID(),valid_from:null,valid_to:null,superseded_at:null,superseded_seq:null,page_id:page.id,crawl_id:crawl.id,observation_id:oid,evidence_id:eid,observed_at:evidence.captured_at,status_code:200,content_hash:evidence.sha256,main_text_hash:null,truncated:false};await insert(snapshot);
});
after(async()=>{await runtime?.end();await admin?.end();});
test('N1 storage migration is repeatable, schema roundtrips and records survive database crash/restart',async()=>{
 await migrate(admin);await runtime.end();await admin.end();
 const data=process.env.AIOS_TEST_DATA!;assert.ok(data.startsWith('/tmp/aios-m1-'));
 execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',data,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart'],{stdio:'pipe'});
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime',max:1});
 await scoped(ta,async c=>{
  for(const [type,table,id] of [['CrawlTarget','crawl_target',target.id],['Page','page',page.id],['PageSnapshot','page_snapshot',snapshot.id]]) {
   const row=(await c.query(`SELECT * FROM aios.${table} WHERE id=$1`,[id])).rows[0];
   for(const [k,v] of Object.entries(row)) {
    if(v instanceof Date)row[k]=v.toISOString();
    if(['schema_version','version','knowledge_seq','depth','priority','attempts','status_code','superseded_seq'].includes(k)&&v!==null)row[k]=Number(v);
   }
   validate(base+'domain.schema.json#/$defs/'+type,{...row,provenance_ids:[]});
   assert.equal((await c.query('SELECT record_type FROM aios.record_index WHERE id=$1',[id])).rows[0].record_type,type);
  }
 });
});
test('N1 same URL has distinct tenant/site identity and omitted predicates remain scoped',async()=>{
 const other={...page,id:randomUUID(),tenant_id:tb,site_id:sb};await insert(other);
 await scoped(tb,async c=>{assert.equal((await c.query('SELECT * FROM aios.page')).rowCount,1);assert.equal((await c.query('SELECT * FROM aios.page_snapshot')).rowCount,0);});
 await scoped(ta,async c=>assert.equal((await c.query('SELECT * FROM aios.page')).rowCount,1));
 assert.equal((await runtime.query('SELECT * FROM aios.page')).rowCount,0);
});
test('N1 storage deduplicates crawl URL, site URL and accepted observation identities',async()=>{
 await assert.rejects(insert({...target,id:randomUUID()}),/duplicate key/);
 await assert.rejects(insert({...page,id:randomUUID()}),/duplicate key/);
 await assert.rejects(insert({...snapshot,id:randomUUID(),series_id:randomUUID()}),/duplicate key/);
 await insert({...target,id:randomUUID(),crawl_id:otherCrawl.id});
});
test('N1 typed foreign keys reject foreign tenant, site and discovery run',async()=>{
 await assert.rejects(insert({...target,id:randomUUID(),tenant_id:tb,site_id:sb}),/foreign key/);
 await assert.rejects(insert({...target,id:randomUUID(),site_id:sc,url_key:'https://orange.example/foreign-site'}),/foreign key/);
 await assert.rejects(insert({...target,id:randomUUID(),crawl_id:otherCrawl.id,url_key:'https://orange.example/child',discovered_from_id:target.id}),/foreign key/);
 const foreignPage={...page,id:randomUUID(),site_id:sc};await insert(foreignPage);
 await assert.rejects(insert({...snapshot,id:randomUUID(),series_id:randomUUID(),observation_id:randomUUID(),page_id:foreignPage.id}),/foreign key/);
});
test('N1 storage enforces admission/truncation/temporal consistency',async()=>{
 await assert.rejects(insert({...target,id:randomUUID(),url_key:'https://orange.example/bad',state:'queued'}),/check constraint/);
 await assert.rejects(insert({...target,id:randomUUID(),url_key:'https://orange.example/bad',state:'excluded'}),/check constraint/);
 await assert.rejects(insert({...snapshot,id:randomUUID(),truncated:true}),/check constraint/);
 await assert.rejects(insert({...snapshot,id:randomUUID(),valid_from:'2026-09-18T01:00:00.000Z',valid_to:'2026-09-18T00:00:00.000Z'}),/check constraint/);
 await assert.rejects(insert({...snapshot,id:randomUUID(),superseded_seq:2}),/check constraint/);
});
test('N1 storage has forced non-owner RLS and grants no unfenced worker acceptance authority',async()=>{
 const r=await admin.query("SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='aios' AND relname IN ('crawl_target','page','page_snapshot')");
 assert.equal(r.rowCount,3);
 for(const table of r.rows){assert.ok(table.relrowsecurity&&table.relforcerowsecurity);assert.notEqual(table.owner,'aios_runtime');}
 for(const role of ['aios_runtime','aios_scheduler','aios_evaluator','aios_operator']) {
  for(const table of ['crawl_target','page','page_snapshot']) {
   const permissions=(await admin.query("SELECT has_table_privilege($1,$2,'INSERT') AS insert,has_table_privilege($1,$2,'UPDATE') AS update,has_table_privilege($1,$2,'DELETE') AS delete",[role,'aios.'+table])).rows[0];
   assert.deepEqual(permissions,{insert:false,update:false,delete:false});
  }
 }
 await assert.rejects(runtime.query('DELETE FROM aios.page'),/permission denied/);
});
