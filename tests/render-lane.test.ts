import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {transaction,scope,tick} from '../packages/persistence/transaction.js';
import {migrate} from '../packages/persistence/migrate.js';
import {Ledger,type Principal} from '../packages/persistence/index.js';
import {LocalBlobs} from '../packages/evidence/index.js';
import {Registry} from '../packages/skills/index.js';
import {Jobs,type Lease} from '../packages/jobs/index.js';
import {FixtureFrontier} from '../packages/jobs/frontier.js';
import {DeletionLedger} from '../packages/policy/deletion.js';
import {canonical,manifestHash} from '../packages/contracts/index.js';
import {RenderLane} from '../packages/jobs/render-lane.js';
import {RenderSupervisor} from '../packages/jobs/render-supervisor.js';
const cfg={host:process.env.AIOS_TEST_SOCKET!,port:55439,database:'aios_render_lane_test'};
let admin:pg.Pool,runtime:pg.Pool,scheduler:pg.Pool,operator:pg.Pool,supervisorPool:pg.Pool;
let blobs:LocalBlobs,ledger:Ledger,deletions:DeletionLedger,jobs:Jobs,worker:Jobs,registry:Registry,lane:RenderLane,supervisor:RenderSupervisor;
const keys=generateKeyPairSync('ed25519'),reviewer=randomUUID(),author=randomUUID();
function connect(){admin=new pg.Pool({...cfg,user:'aios_test_owner'});runtime=new pg.Pool({...cfg,user:'aios_runtime'});scheduler=new pg.Pool({...cfg,user:'aios_scheduler'});operator=new pg.Pool({...cfg,user:'aios_operator'});supervisorPool=new pg.Pool({...cfg,user:'aios_render_supervisor'});}
function services(){ledger=new Ledger(runtime,blobs,'local-synthetic-v1');jobs=new Jobs(runtime,deletions);worker=new Jobs(scheduler,deletions,blobs);registry=new Registry(operator);lane=new RenderLane(scheduler,deletions);supervisor=new RenderSupervisor(supervisorPool);}
before(async()=>{
 const setup=new pg.Pool({...cfg,database:'postgres',user:'aios_test_owner'});await setup.query('CREATE DATABASE aios_render_lane_test');await setup.end();
 admin=new pg.Pool({...cfg,user:'aios_test_owner'});await migrate(admin);
 for(const role of ['aios_scheduler','aios_operator','aios_render_supervisor'])await admin.query(`ALTER ROLE ${role} LOGIN`);await admin.end();connect();
 blobs=await LocalBlobs.create(join(process.env.AIOS_TEST_ROOT!,'render-lane-blobs'),'local-synthetic-v1');deletions=await DeletionLedger.open(join(process.env.AIOS_TEST_ROOT!,'render-lane-deletions'));services();
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");await admin.query('INSERT INTO control.authority_key VALUES($1,$2,true)',[reviewer,keys.publicKey.export({type:'spki',format:'pem'})]);
});
const bound=new Map<string,{lease:Lease;binding:any;terminal?:any;receipt?:string}>();
async function reserve(l:Lease,input:Parameters<RenderLane['reserve']>[1]){
 const receipt=await lane.reserve(l,input);
 if(!bound.has(receipt.reservationId)){
  const binding={lease:l,reservationId:receipt.reservationId,invocationId:receipt.invocationId,processInstanceId:randomUUID(),containerId:manifestHash({fixture:randomUUID()}),imageDigest:manifestHash({fixture:'pinned-image'}),contextHash:receipt.sourceContextHash,startedAt:new Date().toISOString()};
  bound.set(receipt.reservationId,{lease:l,binding});await supervisor.bindInvocation(binding);
 }
 return receipt;
}
// Explicit authenticated supervisor fixtures, never assertions of actual Docker execution.
async function finish(id:string,actualRequests:number|null=null,actualBytes:number|null=null){
 const b=bound.get(id)!;assert.ok(b);
 b.terminal??={...b.binding,finishedAt:new Date().toISOString(),termination:'exited',resultDigest:manifestHash({fixture:'terminal',id}),actualRequests,actualBytes};
 b.receipt=await supervisor.recordTerminalReceipt(b.terminal);await lane.settle(b.lease,id,b.receipt);return b.receipt;
}
afterEach(async()=>{
 for(const id of bound.keys())await finish(id);bound.clear();
 await admin.query("UPDATE control.health SET restore_ready=true,verified_until=clock_timestamp()+interval '1 hour'");
 await admin.query("UPDATE aios.membership SET state='active'");
 await admin.query("UPDATE aios.crawl SET state='cancelled' WHERE state IN ('queued','running','blocked')");
 await admin.query("UPDATE aios.job SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE state IN ('queued','leased','retry_wait')");
});
after(async()=>{for(const pool of [runtime,scheduler,operator,supervisorPool,admin])await pool?.end();});
async function fixture(pages=20,requests=2000){
 const p:Principal={tenantId:randomUUID(),userId:randomUUID()};
 for(const [type,table,changes] of [['Tenant','tenant',{id:p.tenantId}],['User','app_user',{id:p.userId,subject:p.userId}],['Membership','membership',{id:randomUUID(),tenant_id:p.tenantId,user_id:p.userId}]] as const){const row={...JSON.parse(await readFile('spec/examples/'+type.toLowerCase()+'.json','utf8')),...changes},fields=Object.entries(row).filter(([k])=>!['provenance_ids','site_scope_ids'].includes(k));await admin.query(`INSERT INTO aios.${table} (${fields.map(([k])=>k).join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(([,v])=>v));}
 for(const kind of ['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'])await admin.query('INSERT INTO control.tenant_cap VALUES($1,$2,10000)',[p.tenantId,kind]);
 const manifest=JSON.parse(await readFile('spec/examples/skill-reliability-gate.json','utf8'));manifest.skill_id='seo.test-'+randomUUID().replace(/[0-9]/g,n=>String.fromCharCode(103+Number(n)));manifest.last_verified=new Date().toISOString();manifest.freshness_deadline=new Date(Date.now()+3600000).toISOString();
 const approval={author,reviewer,manifest_digest:manifestHash(manifest),evaluation_digest:manifestHash({fixture:true}),approved_at:new Date().toISOString(),scope:'local-synthetic-v1' as const,dependencies:[]};const digest=await registry.approve(manifest,approval,sign(null,Buffer.from(canonical(approval)),keys.privateKey).toString('base64'));
 const url='https://'+randomUUID()+'.example/',site=await ledger.registerSite(p,url),run=await jobs.submit(p,site,randomUUID(),{http_requests:10,render_requests:requests,render_pages:pages,model_calls:0,tokens:0,cost_microusd:0,deadline:new Date(Date.now()+600000).toISOString()});
 const scope=await ledger.acceptSiteScopeFixture(p,site,run,deletions);
 const observe=async(path:string,body:string,mime:string)=>ledger.acceptHttpFixture(p,site,{attemptId:randomUUID(),capturedAt:new Date(Date.now()-1000).toISOString()},{url:url+path,final_url:url+path,method:'GET',status_code:200,headers:[{name:'content-type',value:mime}],truncated:false,error:null},Buffer.from(body));
 const robots=await observe('robots.txt','User-agent: *\nAllow: /\n','text/plain'),sitemap=await observe('sitemap.xml','<urlset><url><loc>'+url+'</loc></url></urlset>','application/xml');
 const evidence=[scope.evidenceId,robots.receiptEvidenceId,robots.bodyEvidenceId!,sitemap.receiptEvidenceId,sitemap.bodyEvidenceId!],observations=[scope.observationId,robots.observationId,sitemap.observationId];
 const frozen=()=>ledger.cutoff(p,site).then(cutoff=>ledger.freeze(p,site,cutoff,evidence,observations));const admission=await frozen();await new FixtureFrontier(runtime,deletions,blobs).discoverSitemap(p,site,run,admission,sitemap.observationId,robots.observationId);
 const raw=await observe('','<title>Fixture render</title>','text/html');evidence.push(raw.receiptEvidenceId,raw.bodyEvidenceId!);observations.push(raw.observationId);
 const initial=await frozen();await jobs.enqueue(p,site,run,initial,digest,randomUUID(),'project');const first=(await worker.claim())!;const snapshot=await worker.projectHttpFixture(first,raw.observationId),bundle=await frozen();
 const next=async()=>{await jobs.enqueue(p,site,run,bundle,digest,randomUUID(),'project');const l=(await worker.claim())!;assert.ok(l);return l;};const lease=await next();
 const prepared=await worker.prepareOfflineRenderFixture(lease,snapshot);assert.equal(prepared.prepared.state,'prepared');if(prepared.prepared.state!=='prepared')throw new Error('fixture preparation failed');
 const input={pageSnapshotId:snapshot,bundleId:bundle,inputSha256:prepared.prepared.inputSha256,profile:'local-offline-replay-v3' as const};return {p,site,run,digest,snapshot,bundle,lease,next,input};
}
test('Render reservation pins exact source context and one worst-case charge per attempt',async()=>{
 const f=await fixture(),[a,b]=await Promise.all([reserve(f.lease,f.input),reserve(f.lease,f.input)]);assert.deepEqual(a,b);assert.equal(a.maxRequests,100);assert.equal(a.maxBytes,10485760);
 await assert.rejects(lane.reserve(f.lease,{...f.input,inputSha256:'0'.repeat(64)}),/conflict/);
 await assert.rejects(lane.settle(f.lease,a.reservationId,randomUUID()),/invalid_receipt/);
 await finish(a.reservationId,3,1024);await finish(a.reservationId);
 assert.equal((await lane.reserve(f.lease,f.input)).state,'settled');
});
test('Render lane enforces one active invocation per run and two globally across tenants',async()=>{
 const a=await fixture(),first=await reserve(a.lease,a.input),sameRun=await a.next();await assert.rejects(lane.reserve(sameRun,a.input),/render_limited/);
 const b=await fixture(),second=await reserve(b.lease,b.input),c=await fixture();await assert.rejects(lane.reserve(c.lease,c.input),/render_limited/);
 await finish(first.reservationId);const third=await reserve(c.lease,c.input);assert.ok(third.reservationId);await finish(second.reservationId);await finish(third.reservationId);
});
test('Twenty render navigations permanently reserve 2000 requests and 200MiB even when measured usage is zero',async()=>{
 const f=await fixture();for(let i=0;i<20;i++){const lease=i===0?f.lease:await f.next(),receipt=await reserve(lease,f.input);await finish(receipt.reservationId,0,0);}
 await assert.rejects(lane.reserve(await f.next(),f.input),/budget_exhausted/);
 const totals=(await admin.query('SELECT count(*) AS pages,sum(reserved_requests) AS requests,sum(reserved_bytes) AS bytes FROM aios.render_reservation WHERE crawl_id=$1',[f.run])).rows[0];assert.deepEqual([Number(totals.pages),Number(totals.requests),Number(totals.bytes)],[20,2000,209715200]);
});
test('Render lane rejects cross-scope source, unpinned bundle and insufficient approved budget',async()=>{
 const f=await fixture();await assert.rejects(lane.reserve(f.lease,{...f.input,pageSnapshotId:randomUUID()}),/snapshot_unavailable|scope_denied/);await assert.rejects(lane.reserve(f.lease,{...f.input,bundleId:randomUUID()}),/bundle_membership_required|scope_denied|conflict/);
 const small=await fixture(1,99);await assert.rejects(lane.reserve(f.lease,{...f.input,pageSnapshotId:small.snapshot}),/snapshot_unavailable|scope_denied/);await assert.rejects(lane.reserve(small.lease,small.input),/budget_exhausted/);
 await assert.rejects(new RenderLane(runtime,deletions).reserve(f.lease,f.input),/service_authority_required/);
});
test('Only the independent render supervisor may bind or attest terminal context',async()=>{
 const f=await fixture(),receipt=await reserve(f.lease,f.input),b=bound.get(receipt.reservationId)!;
 await assert.rejects(new RenderSupervisor(scheduler).bindInvocation(b.binding),/service_authority_required/);
 await assert.rejects(supervisor.bindInvocation({...b.binding,containerId:'a'.repeat(64)}),/conflict/);
 await assert.rejects(supervisor.bindInvocation({...b.binding,contextHash:'0'.repeat(64)}),/conflict|invalid_receipt/);
 await finish(receipt.reservationId);
 await assert.rejects(new RenderSupervisor(scheduler).recordTerminalReceipt(b.terminal),/service_authority_required/);
 await assert.rejects(supervisor.recordTerminalReceipt({...b.terminal,actualRequests:101}),/invalid_receipt/);
 await assert.rejects(supervisor.recordTerminalReceipt({...b.terminal,actualBytes:10485761}),/invalid_receipt/);
 await assert.rejects(supervisor.recordTerminalReceipt({...b.terminal,actualRequests:1}),/conflict/);
});
test('Cancellation and release revocation block new render admission but permit independently proven settlement',async()=>{
 const f=await fixture(),receipt=await reserve(f.lease,f.input);await registry.change(f.digest,'revoked','fixture');await assert.rejects(supervisor.bindInvocation(bound.get(receipt.reservationId)!.binding),/skill_revoked/);await assert.rejects(lane.reserve(f.lease,f.input),/skill_revoked/);await jobs.cancel(f.p,f.site,f.run);await assert.rejects(lane.reserve(f.lease,f.input),/run_fenced/);await finish(receipt.reservationId);
});
test('Scheduler cannot forge terminal rows, release concurrency or refund permanent render charges',async()=>{
 const f=await fixture(),r=await reserve(f.lease,f.input);
 const c=await scheduler.connect();try{await c.query("SELECT set_config('app.tenant_id',$1,false)",[f.p.tenantId]);
 for(const sql of ["UPDATE control.render_concurrency SET in_flight=0","UPDATE aios.render_reservation SET settled_at=clock_timestamp()","DELETE FROM aios.render_reservation","INSERT INTO aios.render_reservation DEFAULT VALUES","INSERT INTO aios.render_invocation DEFAULT VALUES","INSERT INTO aios.render_terminal_receipt DEFAULT VALUES"]){await assert.rejects(c.query(sql),/permission denied/);}
 for(const change of ["actual=0","amount=0","state='reserved'"]){await assert.rejects(c.query(`UPDATE aios.budget_reservation SET ${change} WHERE reservation_id IN (SELECT page_charge_id FROM aios.render_reservation WHERE reservation_id=$1 UNION SELECT request_charge_id FROM aios.render_reservation WHERE reservation_id=$1)`,[r.reservationId]),/immutable|permission denied/);}
 }finally{c.release();}
 assert.equal(Number((await admin.query('SELECT in_flight FROM control.render_concurrency')).rows[0].in_flight),1);
 await finish(r.reservationId);
 const rows=(await admin.query('SELECT actual,amount FROM aios.budget_reservation WHERE crawl_id=$1 ORDER BY amount',[f.run])).rows;assert.deepEqual(rows.map(x=>[Number(x.actual),Number(x.amount)]),[[1,1],[100,100]]);
});
test('Unknown terminal and occupied slot survive immediate PostgreSQL restart without refund or duplicate invocation',async()=>{
 const f=await fixture(),r=await reserve(f.lease,f.input);
 await Promise.all([runtime.end(),scheduler.end(),operator.end(),supervisorPool.end(),admin.end()]);
 const data=process.env.AIOS_TEST_DATA!;assert.ok(data.startsWith('/tmp/aios-m1-'));
 execFileSync(join(process.env.AIOS_TEST_PG_BIN!,'pg_ctl'),['-D',data,'-l',join(process.env.AIOS_TEST_ROOT!,'postgres.log'),'-m','immediate','-w','restart'],{stdio:'pipe'});
 connect();services();assert.deepEqual(await lane.reserve(f.lease,f.input),r);
 assert.equal(Number((await admin.query('SELECT in_flight FROM control.render_concurrency')).rows[0].in_flight),1);
 await assert.rejects(lane.settle(f.lease,r.reservationId,randomUUID()),/invalid_receipt/);
 const next=await f.next();await assert.rejects(lane.reserve(next,f.input),/render_limited/);
 await finish(r.reservationId);const second=await reserve(next,f.input);assert.notEqual(second.invocationId,r.invocationId);await finish(second.reservationId);
 const measured=(await admin.query('SELECT actual_requests,actual_bytes,settled_at FROM aios.render_reservation WHERE reservation_id=$1',[r.reservationId])).rows[0];assert.equal(measured.actual_requests,null);assert.equal(measured.actual_bytes,null);assert.ok(measured.settled_at);
});
test('Render admission and binding enforce current lease, health, membership, deletion and fixture-only policy',async()=>{
 const f=await fixture(),r=await reserve(f.lease,f.input),binding=bound.get(r.reservationId)!.binding;
 await admin.query("UPDATE aios.tenant SET policy_profile_id='other-profile' WHERE id=$1",[f.p.tenantId]);await assert.rejects(supervisor.bindInvocation(binding),/policy_blocked|scope_denied/);await admin.query("UPDATE aios.tenant SET policy_profile_id='local-synthetic-v1' WHERE id=$1",[f.p.tenantId]);
 await admin.query("UPDATE aios.job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",[f.lease.jobId]);
 await assert.rejects(lane.reserve(f.lease,f.input),/lease_lost/);await assert.rejects(supervisor.bindInvocation(binding),/lease_lost/);
 await finish(r.reservationId);
 const h=await fixture();await admin.query("UPDATE control.health SET verified_until=clock_timestamp()-interval '1 second'");await assert.rejects(lane.reserve(h.lease,h.input),/policy_unavailable/);await admin.query("UPDATE control.health SET verified_until=clock_timestamp()+interval '1 hour'");
 await admin.query("UPDATE aios.membership SET state='revoked' WHERE tenant_id=$1",[h.p.tenantId]);await assert.rejects(lane.reserve(h.lease,h.input),/scope_denied/);await admin.query("UPDATE aios.membership SET state='active' WHERE tenant_id=$1",[h.p.tenantId]);
 await admin.query("UPDATE aios.tenant SET policy_profile_id='other-profile' WHERE id=$1",[h.p.tenantId]);await assert.rejects(lane.reserve(h.lease,h.input),/policy_unavailable|policy_blocked|scope_denied/);await admin.query("UPDATE aios.tenant SET policy_profile_id='local-synthetic-v1' WHERE id=$1",[h.p.tenantId]);
 await deletions.record(h.p.tenantId,h.site);await assert.rejects(lane.reserve(h.lease,h.input),/deleted_scope/);
});
test('Existing generic navigation and request reservations also consume render admission budget',async()=>{
 for(const kind of ['render_pages','render_requests'] as const){const f=await fixture();await worker.reserve(f.lease,kind,kind==='render_pages'?20:1901);await assert.rejects(lane.reserve(f.lease,f.input),/budget_exhausted/);}
});
test('Direct SQL render reserve cannot bypass current health, membership or release gates',async()=>{
 const f=await fixture(),l=f.lease;
 const direct=()=>scheduler.query('SELECT * FROM control.reserve_render_accounting($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,f.snapshot,f.bundle,f.input.inputSha256,f.input.profile,'0'.repeat(64),randomUUID()]);
 await admin.query("UPDATE control.health SET verified_until=clock_timestamp()-interval '1 second'");await assert.rejects(direct(),/policy_unavailable/);await admin.query("UPDATE control.health SET verified_until=clock_timestamp()+interval '1 hour'");
 await admin.query("UPDATE aios.membership SET state='revoked' WHERE tenant_id=$1",[f.p.tenantId]);await assert.rejects(direct(),/scope_denied/);await admin.query("UPDATE aios.membership SET state='active' WHERE tenant_id=$1",[f.p.tenantId]);
 await registry.change(f.digest,'revoked','fixture');await assert.rejects(direct(),/skill_revoked/);
 assert.equal(Number((await admin.query('SELECT count(*) FROM aios.render_reservation WHERE crawl_id=$1',[f.run])).rows[0].count),0);assert.equal(Number((await admin.query('SELECT in_flight FROM control.render_concurrency')).rows[0].in_flight),0);
});

test('Rejected source snapshot cannot enter render accounting',async()=>{
 const f=await fixture();await admin.query('ALTER ROLE aios_evaluator LOGIN');const evaluator=new pg.Pool({...cfg,user:'aios_evaluator'});
 try{await transaction(evaluator,'aios_evaluator',async c=>{await scope(c,f.p,f.site);const time=await tick(c,f.p.tenantId),id=randomUUID();
 const row={record_type:'SelfAuditResult',id,schema_version:2,version:1,created_at:time.recorded_at,recorded_at:time.recorded_at,updated_at:time.recorded_at,deleted_at:null,state:'recorded',retention_class:'audit',tenant_id:f.p.tenantId,site_id:f.site,crawl_id:f.run,check_id:'A02',check_version:'1.1.0',result:'fail',effect:'reject_outputs',reason:'independent fixture rejection',knowledge_seq:time.knowledge_seq,scope:'outputs',scope_complete:true,dependency_snapshot_hash:'0'.repeat(64),recovery_of_id:null};
 const fields=Object.entries(row);await c.query(`INSERT INTO self_audit_result (${fields.map(([k])=>k).join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(([,v])=>v));await c.query('INSERT INTO audit_impact VALUES($1,$2,$3,$4,true)',[f.p.tenantId,f.site,id,f.snapshot]);
 });}finally{await evaluator.end();}
 await assert.rejects(lane.reserve(f.lease,f.input),/audit_input_rejected/);
});
