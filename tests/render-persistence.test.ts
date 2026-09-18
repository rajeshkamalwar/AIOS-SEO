import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { base,validate,hash } from '../packages/contracts/index.js';
import { migrate } from '../packages/persistence/migrate.js';

// Migration-owner fixture rows exercise storage, NOT worker acceptance or blob
// integrity. No render worker gets table credentials or SQL write privileges.
type Row=Record<string,any>;
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_render_storage_test'};
let admin:pg.Pool,runtime:pg.Pool;
const tables:Record<string,string>={Tenant:'tenant',User:'app_user',Site:'site',Crawl:'crawl',Page:'page',PageSnapshot:'page_snapshot',Evidence:'evidence',Observation:'observation',RenderSnapshot:'render_snapshot',ResourceObservation:'resource_observation'};
const ta=randomUUID(),tb=randomUUID(),sa=randomUUID(),sb=randomUUID(),sc=randomUUID(),user=randomUUID();
let a:Row,b:Row,c:Row,render:Row,resource:Row;
function common(type:string,tenant:string=ta,site:string=sa):Row {
 const at=new Date().toISOString();return {record_type:type,id:randomUUID(),schema_version:1,version:1,created_at:at,recorded_at:at,updated_at:at,deleted_at:null,provenance_ids:[],tenant_id:tenant,site_id:site,knowledge_seq:1};
}
async function insert(row:Row,links:{id:string;type:string}[]=[],check=true){
 if(check)validate(base+'domain.schema.json#/$defs/'+row.record_type,row);
 const table=tables[row.record_type];assert.ok(table);
 const entries=Object.entries(row).filter(([k])=>!['provenance_ids','evidence_ids'].includes(k));
 const client=await admin.connect();
 try {
  await client.query('BEGIN');
  await client.query(`INSERT INTO aios.${table} (${entries.map(([k])=>k).join(',')}) VALUES(${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));
  for(const [i,link] of links.entries())await client.query('INSERT INTO aios.record_link VALUES($1,$2,\'provenance_ids\',$3,$4,$5)',[row.tenant_id,row.id,i,link.id,link.type]);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
async function fixture(type:string,changes:Row){const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes};await insert(row);return row;}
async function sources(tenant:string,site:string){
 const crawl:Row={...common('Crawl',tenant,site),state:'queued',retention_class:'operations',submitted_by:user,policy_version:'discovery-v1',input_hash:hash(Buffer.from('fixture')),idempotency_key:randomUUID(),stage:'validating',budget:{http_requests:10,render_requests:0,render_pages:0,model_calls:0,tokens:0,cost_microusd:0,deadline:new Date(Date.now()+600000).toISOString()},started_at:null,completed_at:null,completion_reason:null};await insert(crawl);
 const page:Row={...common('Page',tenant,site),state:'active',retention_class:'derived',url:'https://render.example/',url_key:'https://render.example/',page_type:'unknown',type_support:{source_applicability:'uncertain',integrity:'unverified',coverage:'unknown',identity:'provisional',inference:'unknown',reasons:[]}};await insert(page);
 const eid=randomUUID(),oid=randomUUID();
 const evidence=await fixture('Evidence',{id:eid,tenant_id:tenant,site_id:site,artifact_key:`${tenant}/${site}/${eid}`});
 await fixture('Observation',{id:oid,tenant_id:tenant,site_id:site,subject_id:page.id,attempt_id:randomUUID(),evidence_ids:[]});
 const snapshot={...common('PageSnapshot',tenant,site),state:'captured',retention_class:'raw',series_id:randomUUID(),valid_from:null,valid_to:null,superseded_at:null,superseded_seq:null,page_id:page.id,crawl_id:crawl.id,observation_id:oid,evidence_id:eid,observed_at:evidence.captured_at,status_code:200,content_hash:evidence.sha256,main_text_hash:null,truncated:false};await insert(snapshot);
 const observation=await fixture('Observation',{id:randomUUID(),tenant_id:tenant,site_id:site,subject_id:page.id,attempt_id:randomUUID(),evidence_ids:[]});
 return {crawl,snapshot,observation,evidence};
}
function rendered(source:Row,changes:Row={}):Row{return {...common('RenderSnapshot',source.snapshot.tenant_id,source.snapshot.site_id),state:'captured',retention_class:'raw',series_id:randomUUID(),valid_from:null,valid_to:null,superseded_at:null,superseded_seq:null,page_snapshot_id:source.snapshot.id,observation_id:source.observation.id,evidence_id:source.evidence.id,observed_at:new Date().toISOString(),browser_build:'fixture-only',context_hash:hash(Buffer.from('fixture-render')),sample_offset_ms:0,critical_text_hash:null,pending_requests:0,...changes};}
async function scoped(tenant:string,fn:(client:pg.PoolClient)=>Promise<void>){
 const client=await runtime.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);await fn(client);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_render_storage_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);runtime=new pg.Pool({...cfg,user:'aios_runtime',max:1});
 await fixture('Tenant',{id:ta});await fixture('Tenant',{id:tb});await fixture('User',{id:user,subject:user});
 for(const [tenant,site] of [[ta,sa],[tb,sb],[ta,sc]])await fixture('Site',{id:site,site_id:site,tenant_id:tenant,business_id:null,normalized_origin:'https://'+site+'.example',submitted_url:'https://'+site+'.example/',origins:['https://'+site+'.example']});
 a=await sources(ta,sa);b=await sources(tb,sb);c=await sources(ta,sc);
 render=rendered(a);await insert(render,[{id:a.evidence.id,type:'Evidence'}]);
 resource={...common('ResourceObservation'),state:'blocked',retention_class:'raw',render_snapshot_id:render.id,crawl_id:a.crawl.id,url:'https://outside.example/',method:'POST',resource_type:'xhr',status_code:null,error_code:'method_blocked',observed_at:new Date().toISOString(),bytes:0};await insert(resource,[{id:a.observation.id,type:'Observation'}]);
});
after(async()=>{await runtime?.end();await admin?.end();});
test('Render storage schema roundtrip, identity spine and database crash durability for owner-seeded fixtures',async()=>{
 await migrate(admin);await runtime.end();await admin.end();
 const data=process.env.AIOS_TEST_DATA!;assert.ok(data.startsWith('/tmp/aios-m1-'));
 execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',data,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart'],{stdio:'pipe'});
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime',max:1});
 await scoped(ta,async client=>{
  for(const [type,table,id] of [['RenderSnapshot','render_snapshot',render.id],['ResourceObservation','resource_observation',resource.id]]){
   const row=(await client.query(`SELECT * FROM aios.${table} WHERE id=$1`,[id])).rows[0];
   for(const [key,value] of Object.entries(row)){
    if(value instanceof Date)row[key]=value.toISOString();
    if(['schema_version','version','knowledge_seq','superseded_seq','sample_offset_ms','pending_requests','status_code','bytes'].includes(key)&&value!==null)row[key]=Number(value);
   }
   const links=(await client.query('SELECT target_id FROM aios.record_link WHERE owner_id=$1 ORDER BY ordinal',[id])).rows;
   validate(base+'domain.schema.json#/$defs/'+type,{...row,provenance_ids:links.map(r=>r.target_id)});
   assert.equal(links.length,1);assert.equal((await client.query('SELECT record_type FROM aios.record_index WHERE id=$1',[id])).rows[0].record_type,type);
  }
 });
});
test('Render records reject cross-tenant/site references and cross-run resource associations',async()=>{
 for(const foreign of [b,c])for(const [field,id] of [['page_snapshot_id',foreign.snapshot.id],['observation_id',foreign.observation.id],['evidence_id',foreign.evidence.id]]){
  await assert.rejects(insert(rendered(a,{sample_offset_ms:2000,[field as string]:id})),/foreign key/);
 }
 await assert.rejects(insert({...resource,id:randomUUID(),tenant_id:tb,site_id:sb,crawl_id:b.crawl.id}),/scope_denied|foreign key/);
 await assert.rejects(insert({...resource,id:randomUUID(),site_id:sc,crawl_id:c.crawl.id}),/scope_denied|foreign key/);
 const different={...a.crawl,id:randomUUID(),idempotency_key:randomUUID()};await insert(different);
 await assert.rejects(insert({...resource,id:randomUUID(),crawl_id:different.id}),/scope_denied/);
 await assert.rejects(insert(rendered(a,{sample_offset_ms:2000}),[{id:c.evidence.id,type:'Evidence'}]),/scope_denied/);
});
test('Captured render requires evidence; failures can have null evidence and no fictional capture',async()=>{
 await assert.rejects(insert(rendered(a,{evidence_id:null,sample_offset_ms:2000}),[],false),/check constraint/);
 await assert.rejects(insert(rendered(a,{evidence_id:randomUUID(),sample_offset_ms:2000})),/foreign key/);
 for(const [index,state] of ['timeout','failed','policy_limited'].entries())await insert(rendered(a,{state,evidence_id:null,sample_offset_ms:10000+index}));
 await insert({...resource,id:randomUUID(),render_snapshot_id:null,state:'failed',error_code:'no_capture'});
});
test('Render sample identity, temporal interval and raw immutable fields are enforced',async()=>{
 await assert.rejects(insert(rendered(a)),/duplicate key/);
 await assert.rejects(insert(rendered(a,{sample_offset_ms:2000,series_id:render.series_id})),/duplicate key/);
 await assert.rejects(insert(rendered(a,{sample_offset_ms:2000,valid_from:'2026-01-02T00:00:00.000Z',valid_to:'2026-01-01T00:00:00.000Z'})),/check constraint/);
 await assert.rejects(insert(rendered(a,{sample_offset_ms:2000,superseded_seq:2})),/check constraint/);
 await assert.rejects(insert(rendered(a,{sample_offset_ms:2000,superseded_seq:1,superseded_at:new Date().toISOString()})),/check constraint/);
 for(const [table,id] of [['render_snapshot',render.id],['resource_observation',resource.id]]){
  await assert.rejects(admin.query(`UPDATE aios.${table} SET state='failed' WHERE id=$1`,[id]),/immutable_record/);
  await assert.rejects(admin.query(`DELETE FROM aios.${table} WHERE id=$1`,[id]),/immutable_record/);
  await assert.rejects(admin.query("INSERT INTO aios.record_link VALUES($1,$2,'provenance_ids',1,$3,'Observation')",[ta,id,a.observation.id]),/immutable_reference_set/);
  await assert.rejects(admin.query('UPDATE aios.record_link SET ordinal=2 WHERE owner_id=$1',[id]),/immutable_reference_set/);
  await assert.rejects(admin.query('DELETE FROM aios.record_link WHERE owner_id=$1',[id]),/immutable_reference_set/);
 }
});
test('Render storage pooled reads stay tenant-scoped and service roles have no unfenced write grants',async()=>{
 await insert(rendered(b));
 await scoped(tb,async client=>{assert.equal((await client.query('SELECT * FROM aios.render_snapshot')).rowCount,1);assert.equal((await client.query('SELECT * FROM aios.resource_observation')).rowCount,0);});
 await scoped(ta,async client=>{assert.ok((await client.query('SELECT * FROM aios.render_snapshot')).rows.every(r=>r.tenant_id===ta));});
 assert.equal((await runtime.query('SELECT * FROM aios.render_snapshot')).rowCount,0);
 assert.equal((await runtime.query('SELECT * FROM aios.resource_observation')).rowCount,0);
 for(const table of ['render_snapshot','resource_observation']){
  const flags=(await admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",['aios.'+table])).rows[0];assert.deepEqual(flags,{relrowsecurity:true,relforcerowsecurity:true});
  for(const role of ['aios_runtime','aios_scheduler','aios_evaluator','aios_operator']){
   const access=(await admin.query("SELECT has_table_privilege($1,$2,'INSERT') AS insert,has_table_privilege($1,$2,'UPDATE') AS update,has_table_privilege($1,$2,'DELETE') AS delete",[role,'aios.'+table])).rows[0];assert.deepEqual(access,{insert:false,update:false,delete:false});
  }
  await assert.rejects(runtime.query(`UPDATE aios.${table} SET state='failed'`),/permission denied/);
  await assert.rejects(runtime.query(`INSERT INTO aios.${table} SELECT * FROM aios.${table}`),/permission denied/);
 }
});
