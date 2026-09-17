import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID,generateKeyPairSync,sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { migrate } from '../packages/persistence/migrate.js';
import { Ledger,type Principal } from '../packages/persistence/index.js';
import { LocalBlobs } from '../packages/evidence/index.js';
import { Registry } from '../packages/skills/index.js';
import { Jobs,type Budget,type Lease } from '../packages/jobs/index.js';
import { DeletionLedger } from '../packages/policy/deletion.js';
import { canonical,manifestHash } from '../packages/contracts/index.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_jobs_test'};
const root=process.env.AIOS_TEST_ROOT!;
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool,evaluator:pg.Pool;
let ledger:Ledger,commands:Jobs,worker:Jobs,registry:Registry,deletions:DeletionLedger;
let p:Principal,site:string,bundle:string,digest:string;
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
 ledger=new Ledger(runtime,await LocalBlobs.create(join(root,'jobs-blobs'),'local-synthetic-v1'),'local-synthetic-v1');
 site=await ledger.registerSite(p,'https://jobs.example/');
 const receipt=await ledger.accept(p,site,{attemptId:randomUUID(),sourceUri:'https://jobs.example/',capturedAt:new Date(Date.now()-1000).toISOString(),mimeType:'text/html',contextHash:manifestHash({fixture:true})},Buffer.from('fixture'));
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
test('M2 deletion tombstone survives a stale database epoch and blocks acceptance',async()=>{
 await run();const l=(await worker.claim())!;await deletions.record(p.tenantId,site);
 await assert.rejects(worker.complete(l,bundle),/deleted_scope/);await assert.rejects(commands.submit(p,site,randomUUID(),budget()),/deleted_scope/);
 // No database deletion/epoch update happened: independently retained tombstone alone fences an older DB.
 assert.equal((await admin.query('SELECT deletion_epoch FROM aios.tenant WHERE id=$1',[p.tenantId])).rows[0].deletion_epoch,'0');await stopAll();
});
