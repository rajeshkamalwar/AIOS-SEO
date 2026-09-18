import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { migrate } from '../packages/persistence/migrate.js';
import { Ledger,type Principal } from '../packages/persistence/index.js';
import { LocalBlobs } from '../packages/evidence/index.js';
import { DeletionLedger } from '../packages/policy/deletion.js';
import { Jobs } from '../packages/jobs/index.js';
import { PostgresReadOnlyStore,ReadOnlyApi } from '../packages/api/index.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_api_scope_test'};
const owner:Principal={tenantId:randomUUID(),userId:randomUUID()};
const foreign:Principal={tenantId:randomUUID(),userId:randomUUID()};
const editor:Principal={tenantId:owner.tenantId,userId:randomUUID()};
const viewer:Principal={tenantId:owner.tenantId,userId:randomUUID()};
const memberships=new Map<string,string>();
let admin:pg.Pool,runtime:pg.Pool,ledger:Ledger,deletions:DeletionLedger,jobs:Jobs,store:PostgresReadOnlyStore,api:ReadOnlyApi;
let site:string,otherSite:string,foreignSite:string,run:string,otherRun:string,foreignRun:string;
async function fixture(type:string,changes:Record<string,unknown>){
 const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes};
 const table=({Tenant:'tenant',User:'app_user',Membership:'membership'} as Record<string,string>)[type];
 const entries=Object.entries(row).filter(([key])=>!['provenance_ids','site_scope_ids'].includes(key));
 await admin.query(`INSERT INTO aios.${table} (${entries.map(([key])=>key).join(',')}) VALUES(${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,value])=>value));
}
const read=(principal:Principal,id:string)=>api.handle({principal,method:'GET',path:'/v1/discovery-runs/'+id});
const cancel=(principal:Principal,id:string)=>api.handle({principal,method:'POST',csrf:'scope-test',path:'/v1/discovery-runs/'+id+'/cancel'});
function denied(response:Awaited<ReturnType<typeof read>>){
 assert.equal(response.status,404);
 const body=response.body as {request_id:string;error:unknown};
 assert.deepEqual(body.error,{code:'scope_denied',retryable:false,detail:'scope_denied',evidence_ids:[]});
 assert.deepEqual(Object.keys(body).sort(),['error','request_id']);
}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_api_scope_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 runtime=new pg.Pool({...cfg,user:'aios_runtime',max:1});
 for(const p of [owner,foreign])await fixture('Tenant',{id:p.tenantId});
 for(const p of [owner,foreign,editor,viewer]){
  await fixture('User',{id:p.userId,subject:p.userId});const id=randomUUID();memberships.set(p.userId,id);
  await fixture('Membership',{id,tenant_id:p.tenantId,user_id:p.userId,role:p===viewer?'viewer':p===editor?'editor':'owner'});
 }
 const blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'api-scope-blobs'),'local-synthetic-v1');
 deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'api-scope-deletions'));
 ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);store=new PostgresReadOnlyStore(runtime,ledger,deletions);api=new ReadOnlyApi(store,'scope-test');
 site=await ledger.registerSite(owner,'https://allowed.example/');otherSite=await ledger.registerSite(owner,'https://denied.example/');foreignSite=await ledger.registerSite(foreign,'https://allowed.example/');
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");
 for(const p of [owner,foreign])for(const kind of ['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'])await admin.query('INSERT INTO control.tenant_cap VALUES($1,$2,10000)',[p.tenantId,kind]);
 run=await jobs.submitDiscovery(owner,site,randomUUID());otherRun=await jobs.submitDiscovery(owner,otherSite,randomUUID());foreignRun=await jobs.submitDiscovery(foreign,foreignSite,randomUUID());
 for(const p of [editor,viewer]){
  await admin.query("INSERT INTO aios.record_link VALUES($1,$2,'site_scope_ids',0,$3,'Site')",[p.tenantId,memberships.get(p.userId),site]);
  await admin.query('UPDATE aios.membership SET all_sites=false WHERE id=$1',[memberships.get(p.userId)]);
 }
});
after(async()=>{await runtime?.end();await admin?.end();});
test('site-limited editor and viewer can read only their permitted run',async()=>{
 for(const p of [editor,viewer]){const response=await read(p,run);assert.equal(response.status,200);assert.equal((response.body as {site_id:string}).site_id,site);}
 denied(await read(editor,otherRun));denied(await read(editor,foreignRun));denied(await read(editor,randomUUID()));
 // A one-connection pool must reset tenant/principal scope between requests.
 assert.equal((await read(foreign,foreignRun)).status,200);denied(await read(foreign,run));assert.equal((await read(editor,run)).status,200);
});
test('site-limited cancellation rechecks write permission and preserves foreign runs',async()=>{
 denied(await cancel(viewer,run));denied(await cancel(editor,otherRun));denied(await cancel(editor,foreignRun));denied(await cancel(editor,randomUUID()));
 for(const id of [run,otherRun,foreignRun])assert.equal((await admin.query('SELECT state FROM aios.crawl WHERE id=$1',[id])).rows[0].state,'queued');
 const response=await cancel(editor,run);assert.equal(response.status,202);assert.equal((response.body as {state:string}).state,'cancelled');
});
test('revoked membership blocks reads and cancellation even after successful scoped reads',async()=>{
 await admin.query("UPDATE aios.membership SET state='revoked' WHERE id=$1",[memberships.get(editor.userId)]);
 try {denied(await read(editor,run));denied(await cancel(editor,run));}finally{await admin.query("UPDATE aios.membership SET state='active' WHERE id=$1",[memberships.get(editor.userId)]);}
 assert.equal((await read(editor,run)).status,200);
});
test('removing a site grant blocks the run without revoking other members',async()=>{
 await admin.query("DELETE FROM aios.record_link WHERE owner_id=$1 AND field_name='site_scope_ids'",[memberships.get(editor.userId)]);
 try {denied(await read(editor,run));denied(await cancel(editor,run));assert.equal((await read(viewer,run)).status,200);}
 finally {await admin.query("INSERT INTO aios.record_link VALUES($1,$2,'site_scope_ids',0,$3,'Site')",[editor.tenantId,memberships.get(editor.userId),site]);}
});
test('archived site denies existing run reads and cancellation',async()=>{
 await admin.query("UPDATE aios.site SET state='archived' WHERE id=$1",[site]);
 try {denied(await read(editor,run));denied(await read(owner,run));denied(await cancel(editor,run));}
 finally {await admin.query("UPDATE aios.site SET state='provisional' WHERE id=$1",[site]);}
});
test('independent deletion tombstone denies reads and cancellation before database purge',async()=>{
 await deletions.record(owner.tenantId,site);
 assert.equal((await admin.query('SELECT id FROM aios.crawl WHERE id=$1',[run])).rowCount,1);
 denied(await read(editor,run));denied(await read(owner,run));denied(await cancel(editor,run));
 assert.equal((await read(foreign,foreignRun)).status,200);
});
