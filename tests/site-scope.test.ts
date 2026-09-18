import { test,before,after,afterEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ledger,type Principal,sweepOrphans } from '../packages/persistence/index.js';
import { LocalBlobs } from '../packages/evidence/index.js';
import { DeletionLedger } from '../packages/policy/deletion.js';
import { Jobs } from '../packages/jobs/index.js';
import { migrate } from '../packages/persistence/migrate.js';
import { base,validate,hash,canonical } from '../packages/contracts/index.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_site_scope_test'};
const p:Principal={tenantId:randomUUID(),userId:randomUUID()},other:Principal={tenantId:randomUUID(),userId:randomUUID()},peer:Principal={tenantId:p.tenantId,userId:randomUUID()};
let admin:pg.Pool,runtime:pg.Pool,ledger:Ledger,blobs:LocalBlobs,deletions:DeletionLedger,jobs:Jobs,site:string,otherSite:string;
async function fixture(type:string,changes:Record<string,unknown>){
 const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes};validate(base+'domain.schema.json#/$defs/'+type,row);
 const table=({Tenant:'tenant',User:'app_user',Membership:'membership'} as Record<string,string>)[type],entries=Object.entries(row).filter(([k])=>!['provenance_ids','site_scope_ids'].includes(k));
 await admin.query(`INSERT INTO aios.${table} (${entries.map(([k])=>k).join(',')}) VALUES(${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));
}
const run=(person=p,wantedSite=site)=>jobs.submit(person,wantedSite,randomUUID(),{http_requests:10,render_requests:0,render_pages:0,model_calls:0,tokens:0,cost_microusd:0,deadline:new Date(Date.now()+600000).toISOString()});
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_site_scope_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);runtime=new pg.Pool({...cfg,user:'aios_runtime',max:3});
 for(const person of [p,other])await fixture('Tenant',{id:person.tenantId});
 for(const person of [p,other,peer]){await fixture('User',{id:person.userId,subject:person.userId});await fixture('Membership',{id:randomUUID(),tenant_id:person.tenantId,user_id:person.userId});}
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'site-scope-blobs'),'local-synthetic-v1');deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'scope-deletion-ledger'));
 ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);
 site=await ledger.registerSite(p,'https://scope.example/');otherSite=await ledger.registerSite(other,'https://scope.example/');
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");
 for(const person of [p,other])for(const kind of ['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'])await admin.query('INSERT INTO control.tenant_cap VALUES($1,$2,10000)',[person.tenantId,kind]);
});
afterEach(async()=>{
 if(!admin)return;
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");
 for(const r of (await admin.query("SELECT tenant_id,site_id,id FROM aios.crawl WHERE state IN ('queued','running','blocked')")).rows)await jobs.cancel(r.tenant_id===p.tenantId?p:other,r.site_id,r.id);
});
after(async()=>{await runtime?.end();await admin?.end();});
test('scope receipt derives exact DB scope, is internal-policy evidence and explicitly grants no external authority',async()=>{
 const crawl=await run(),accepted=await ledger.acceptSiteScopeFixture(p,site,crawl,deletions);
 const bytes=await ledger.artifact(p,site,accepted.evidenceId),receipt=JSON.parse(bytes.toString());validate(base+'scope-receipt.schema.json',receipt);
 assert.equal(bytes.toString(),canonical(receipt));assert.equal(receipt.tenant_id,p.tenantId);assert.equal(receipt.site_id,site);assert.equal(receipt.crawl_id,crawl);assert.equal(receipt.submitted_by,p.userId);
 assert.equal(receipt.submitted_url,'https://scope.example/');assert.equal(receipt.normalized_origin,'https://scope.example');assert.equal(receipt.authority,'fixture_only');assert.equal(receipt.ownership,'not_established');assert.equal(receipt.live_dispatch,false);assert.equal(receipt.website_write,false);
 const evidence=(await admin.query('SELECT * FROM aios.evidence WHERE id=$1',[accepted.evidenceId])).rows[0];assert.equal(evidence.source_class,'internal_policy');assert.equal(evidence.sha256,hash(bytes));assert.equal(Number(evidence.bytes),bytes.length);
 const observation=await ledger.observation(p,site,accepted.observationId);assert.equal(observation.sensor_id,'site-scope');assert.equal(observation.subject_id,crawl);assert.equal(observation.context_hash,hash(bytes));assert.equal(observation.fresh_until,receipt.expires_at);assert.deepEqual(observation.evidence_ids,[accepted.evidenceId]);
 const frozen=await ledger.freeze(p,site,await ledger.cutoff(p,site),[accepted.evidenceId],[accepted.observationId]);assert.deepEqual((await ledger.bundle(p,site,frozen)).observation_ids,[accepted.observationId]);
 assert.ok((await ledger.pending(p,site)).some(e=>(e.payload as Record<string,unknown>).observation_id===accepted.observationId));
 assert.equal((await admin.query('SELECT * FROM aios.job WHERE crawl_id=$1',[crawl])).rowCount,0);
});
test('scope acceptance is idempotent per run across concurrent calls and reopen',async()=>{
 const crawl=await run();const [a,b]=await Promise.all([ledger.acceptSiteScopeFixture(p,site,crawl,deletions),ledger.acceptSiteScopeFixture(p,site,crawl,deletions)]);assert.deepEqual(a,b);
 assert.equal((await admin.query('SELECT * FROM aios.site_scope_acceptance WHERE crawl_id=$1',[crawl])).rowCount,1);
 const reopened=new pg.Pool({...cfg,user:'aios_runtime'});try{const next=new Ledger(reopened,blobs,'local-synthetic-v1');assert.deepEqual(await next.acceptSiteScopeFixture(p,site,crawl,deletions),a);assert.ok((await next.artifact(p,site,a.evidenceId)).length);}finally{await reopened.end();}
});
test('scope acceptance rejects invented runs, foreign tenant/site and a different submitting principal',async()=>{
 const crawl=await run(),foreign=await run(other,otherSite);
 await assert.rejects(ledger.acceptSiteScopeFixture(p,site,randomUUID(),deletions),/scope_denied/);
 await assert.rejects(ledger.acceptSiteScopeFixture(p,site,foreign,deletions),/scope_denied/);
 await assert.rejects(ledger.acceptSiteScopeFixture(other,otherSite,crawl,deletions),/scope_denied/);
 await assert.rejects(ledger.acceptSiteScopeFixture(peer,site,crawl,deletions),/scope_denied/);
 const second=await ledger.registerSite(p,'https://scope-second.example/');await assert.rejects(ledger.acceptSiteScopeFixture(p,second,crawl,deletions),/scope_denied/);
 await assert.rejects(ledger.acceptSiteScopeFixture(p,site,crawl,undefined as unknown as DeletionLedger),/deletion_adapter_required/);
});
test('scope receipt retry never substitutes for current membership and cancellation checks',async()=>{
 const crawl=await run();await ledger.acceptSiteScopeFixture(p,site,crawl,deletions);
 await admin.query("UPDATE aios.membership SET state='revoked' WHERE tenant_id=$1 AND user_id=$2",[p.tenantId,p.userId]);
 try{await assert.rejects(ledger.acceptSiteScopeFixture(p,site,crawl,deletions),/scope_denied/);}finally{await admin.query("UPDATE aios.membership SET state='active' WHERE tenant_id=$1 AND user_id=$2",[p.tenantId,p.userId]);}
 await jobs.cancel(p,site,crawl);await assert.rejects(ledger.acceptSiteScopeFixture(p,site,crawl,deletions),/run_fenced/);
});
test('quarantine, deletion epoch, policy health and deadline block new scope evidence',async()=>{
 const crawl=await run();
 await admin.query('UPDATE aios.work_fence SET quarantined=true WHERE crawl_id=$1',[crawl]);await assert.rejects(ledger.acceptSiteScopeFixture(p,site,crawl,deletions),/run_fenced/);
 await admin.query('UPDATE aios.work_fence SET quarantined=false,deletion_epoch=1 WHERE crawl_id=$1',[crawl]);await assert.rejects(ledger.acceptSiteScopeFixture(p,site,crawl,deletions),/run_fenced/);
 await admin.query('UPDATE aios.work_fence SET deletion_epoch=0 WHERE crawl_id=$1',[crawl]);await admin.query('UPDATE control.health SET restore_ready=false');await assert.rejects(ledger.acceptSiteScopeFixture(p,site,crawl,deletions),/policy_unavailable/);
 await admin.query("UPDATE control.health SET restore_ready=true");await admin.query("UPDATE aios.crawl SET budget=jsonb_set(budget,'{deadline}',to_jsonb('2000-01-01T00:00:00.000Z'::text)) WHERE id=$1",[crawl]);await assert.rejects(ledger.acceptSiteScopeFixture(p,site,crawl,deletions),/deadline/);
 assert.equal((await admin.query('SELECT * FROM aios.site_scope_acceptance WHERE crawl_id=$1',[crawl])).rowCount,0);
});
test('event failure rolls back scope evidence, observation and clock while uploaded private orphan can be swept',async()=>{
 const crawl=await run(),before=(await admin.query('SELECT seq FROM aios.knowledge_clock WHERE tenant_id=$1',[p.tenantId])).rows[0].seq;
 await admin.query("CREATE FUNCTION aios.test_scope_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'scope_event_failure'; END $$; CREATE TRIGGER test_scope_event_failure BEFORE INSERT ON aios.outbox FOR EACH ROW EXECUTE FUNCTION aios.test_scope_event_failure()");
 try{await assert.rejects(ledger.acceptSiteScopeFixture(p,site,crawl,deletions),/scope_event_failure/);}finally{await admin.query('DROP TRIGGER test_scope_event_failure ON aios.outbox; DROP FUNCTION aios.test_scope_event_failure()');}
 assert.equal((await admin.query('SELECT * FROM aios.site_scope_acceptance WHERE crawl_id=$1',[crawl])).rowCount,0);assert.equal((await admin.query('SELECT * FROM aios.observation WHERE subject_id=$1',[crawl])).rowCount,0);assert.equal((await admin.query('SELECT seq FROM aios.knowledge_clock WHERE tenant_id=$1',[p.tenantId])).rows[0].seq,before);assert.ok(await sweepOrphans(admin,blobs)>=1);
});
test('policy freshness is rechecked after a delayed private artifact upload',async()=>{
 const crawl=await run(),put=blobs.put.bind(blobs);let uploaded=false;
 blobs.put=async(key,bytes)=>{await put(key,bytes);uploaded=true;await admin.query("UPDATE control.health SET verified_until=clock_timestamp()+interval '20 milliseconds'");await new Promise(resolve=>setTimeout(resolve,60));};
 try{await assert.rejects(ledger.acceptSiteScopeFixture(p,site,crawl,deletions),/policy_unavailable/);}finally{blobs.put=put;}
 assert.equal(uploaded,true);assert.equal((await admin.query('SELECT * FROM aios.site_scope_acceptance WHERE crawl_id=$1',[crawl])).rowCount,0);
 assert.equal((await admin.query('SELECT * FROM aios.observation WHERE subject_id=$1',[crawl])).rowCount,0);
});
test('scope relation is RLS protected and immutable; tombstone fences a stale database',async()=>{
 const freshSite=await ledger.registerSite(p,'https://scope-delete.example/'),crawl=await run(p,freshSite);await ledger.acceptSiteScopeFixture(p,freshSite,crawl,deletions);
 assert.equal((await runtime.query('SELECT * FROM aios.site_scope_acceptance')).rowCount,0);await assert.rejects(runtime.query('DELETE FROM aios.site_scope_acceptance'),/permission denied/);
 await deletions.record(p.tenantId,freshSite);await assert.rejects(ledger.acceptSiteScopeFixture(p,freshSite,crawl,deletions),/deleted_scope/);
 assert.equal((await admin.query('SELECT deletion_epoch FROM aios.tenant WHERE id=$1',[p.tenantId])).rows[0].deletion_epoch,'0');
});
