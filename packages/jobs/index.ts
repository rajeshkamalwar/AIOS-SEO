import type { Pool, PoolClient } from 'pg';
import { randomUUID, randomInt } from 'node:crypto';
import { base, validate, uuid, manifestHash, hash } from '../contracts/index.js';
import type { LocalBlobs } from '../evidence/index.js';
import type { Principal } from '../persistence/index.js';
import { transaction, scope, tick, insertDomain, event, registryLock, workLock } from '../persistence/transaction.js';
import { eligible } from '../skills/index.js';
import { normalizeUrl } from '../perception/url.js';
import { DeletionLedger } from '../policy/deletion.js';
export interface Budget { http_requests:number; render_requests:number; render_pages:number; model_calls:number; tokens:number; cost_microusd:number; deadline:string }
export type BudgetKind=Exclude<keyof Budget,'deadline'>;
export interface Lease { tenantId:string; siteId:string; runId:string; jobId:string; token:string; attempt:number; attemptId:string }
const moneyKinds:BudgetKind[]=['http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd'];
export class Jobs {
 constructor(private pool:Pool, private deletions:DeletionLedger, private artifacts?:Pick<LocalBlobs,'read'>){}
 private async locks(c:PoolClient){
  await c.query('SELECT pg_advisory_xact_lock_shared($1)',[registryLock]);
  await c.query('SELECT pg_advisory_xact_lock($1)',[workLock]);
 }
 private async health(c:PoolClient){
  if(!(await c.query("SELECT 1 FROM control.health WHERE singleton AND policy_version='discovery-v1' AND verified_until>clock_timestamp() AND restore_ready")).rowCount)throw new Error('policy_unavailable');
 }
 private async live(c:PoolClient,tenant:string,site:string,run:string){
  if(await this.deletions.contains(tenant,site))throw new Error('deleted_scope');
  const r=(await c.query(`SELECT r.*,t.deletion_epoch,f.deletion_epoch AS pinned_epoch,f.quarantined FROM crawl r JOIN tenant t ON t.id=r.tenant_id
    JOIN work_fence f ON f.tenant_id=r.tenant_id AND f.crawl_id=r.id WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.id=$3 FOR UPDATE OF r`,[tenant,site,run])).rows[0];
  if(!r || r.state!=='running' || r.quarantined || r.pinned_epoch!==r.deletion_epoch)throw new Error('run_fenced');
  await scope(c,{tenantId:tenant,userId:r.submitted_by},site);
  if((await c.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[r.budget.deadline])).rows[0].expired)throw new Error('deadline');
  await this.health(c);return r;
 }
 async submit(p:Principal,site:string,key:string,budget:Budget):Promise<string>{
  validate(base+'common.schema.json#/$defs/budget',budget);
  if(!key||key.length>4096)throw new Error('invalid_input');
  const inputHash=manifestHash({site,budget,policy:'discovery-v1'});
  return transaction(this.pool,'aios_runtime',async c=>{
   await this.locks(c);await scope(c,p,site);await this.health(c);
   if(await this.deletions.contains(p.tenantId,site))throw new Error('deleted_scope');
   const prior=(await c.query('SELECT id,input_hash FROM crawl WHERE tenant_id=$1 AND idempotency_key=$2',[p.tenantId,key])).rows[0];
   if(prior){if(prior.input_hash!==inputHash)throw new Error('conflict');return prior.id;}
   const time=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
   if(Date.parse(budget.deadline)<=+time || Date.parse(budget.deadline)>+time+1200000)throw new Error('deadline');
   // Cross-tenant admission count comes from a narrow definer function, not unrestricted tenant record access.
   const counts=(await c.query('SELECT * FROM control.admission_counts($1)',[p.tenantId])).rows[0];
   if(Number(counts.tenant_queued)>=10 || Number(counts.global_queued)>=200)throw new Error('admission_limited');
   const caps=(await c.query('SELECT kind,amount FROM control.tenant_cap WHERE tenant_id=$1',[p.tenantId])).rows;
   if(moneyKinds.some(k=>!caps.some(r=>r.kind===k && Number(r.amount)>=budget[k])))throw new Error('budget_exhausted');
   const t=await tick(c,p.tenantId), id=randomUUID();
   await insertDomain(c,'crawl',{record_type:'Crawl',id,schema_version:1,version:1,created_at:t.recorded_at,...t,updated_at:t.recorded_at,deleted_at:null,state:'queued',retention_class:'operations',provenance_ids:[],tenant_id:p.tenantId,site_id:site,submitted_by:p.userId,policy_version:'discovery-v1',input_hash:inputHash,idempotency_key:key,stage:'validating',budget,started_at:null,completed_at:null,completion_reason:null});
   await c.query('INSERT INTO work_fence SELECT $1,$2,$3,deletion_epoch,false FROM tenant WHERE id=$1',[p.tenantId,site,id]);
   await c.query('INSERT INTO audit_scope(tenant_id,crawl_id) VALUES($1,$2)',[p.tenantId,id]);
   const siteRow=(await c.query('SELECT submitted_url FROM site WHERE tenant_id=$1 AND id=$2',[p.tenantId,site])).rows[0];
   const seed=normalizeUrl(siteRow.submitted_url);
   if(seed.excluded)throw new Error('policy_blocked');
   await c.query('SELECT control.seed_submitted_target($1,$2)',[id,seed.url]);
   await event(c,p.tenantId,site,id,id,'crawl.requested',{crawl_id:id,policy_version:'discovery-v1'});return id;
  });
 }
 async enqueue(p:Principal,site:string,run:string,input:string,digest:string,key:string,kind='audit'):Promise<string>{
  uuid(run);uuid(input);if(!key||key.length>4096||!['audit','evaluate','project'].includes(kind))throw new Error('handler_not_installed');
  return transaction(this.pool,'aios_runtime',async c=>{
   await this.locks(c);await scope(c,p,site);await this.health(c);
   if(await this.deletions.contains(p.tenantId,site))throw new Error('deleted_scope');
   const r=(await c.query("SELECT * FROM crawl WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND state IN ('queued','running')",[p.tenantId,site,run])).rows[0];
   if(!r)throw new Error('run_fenced');
   const bundle=(await c.query('SELECT manifest_hash FROM evidence_bundle WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[p.tenantId,site,input])).rows[0];
   if(!bundle)throw new Error('scope_denied');
   const hash=manifestHash({input,digest,kind,revision:bundle.manifest_hash,policy:r.policy_version});
   const prior=(await c.query('SELECT job_id,expected_input_hash FROM job WHERE tenant_id=$1 AND crawl_id=$2 AND idempotency_key=$3',[p.tenantId,run,key])).rows[0];
   if(prior){if(prior.expected_input_hash!==hash)throw new Error('conflict');return prior.job_id;}
   const releases=await eligible(c,digest,true), id=randomUUID();
   await c.query(`INSERT INTO job(tenant_id,site_id,crawl_id,job_id,kind,state,input_ref,expected_input_hash,idempotency_key,available_at,deadline,release_digest,release_generation)
    VALUES($1,$2,$3,$4,$5,'queued',$6,$7,$8,clock_timestamp(),$9,$10,$11)`,[p.tenantId,site,run,id,kind,input,hash,key,r.budget.deadline,digest,releases.find(x=>x.digest===digest)!.generation]);
   for(const release of releases)await c.query('INSERT INTO job_release VALUES($1,$2,$3,$4)',[p.tenantId,id,release.digest,release.generation]);
   return id;
  });
 }
 async claim():Promise<Lease|null>{
  return transaction(this.pool,'aios_scheduler',async c=>{
   await this.locks(c);await this.health(c);
   const candidates=(await c.query(`SELECT j.*,r.submitted_by,r.state AS run_state FROM job j JOIN crawl r ON r.tenant_id=j.tenant_id AND r.id=j.crawl_id
     LEFT JOIN control.scheduler_turn s ON s.tenant_id=j.tenant_id WHERE j.state IN ('queued','retry_wait') AND j.available_at<=clock_timestamp() AND j.deadline>clock_timestamp() AND j.attempt<3 AND r.state IN ('queued','running')
     ORDER BY coalesce(s.last_dispatch,0),j.available_at,j.job_id LIMIT 200`)).rows;
   for(const j of candidates){
    await c.query('SAVEPOINT candidate');
    try{
     await scope(c,{tenantId:j.tenant_id,userId:j.submitted_by},j.site_id);
     if (!(await c.query("SELECT 1 FROM job WHERE tenant_id=$1 AND job_id=$2 AND state IN ('queued','retry_wait') FOR UPDATE SKIP LOCKED",[j.tenant_id,j.job_id])).rowCount) { await c.query('ROLLBACK TO SAVEPOINT candidate'); continue; }
     if(j.run_state==='queued'){
      const active=(await c.query(`SELECT count(*) AS total,count(*) FILTER(WHERE tenant_id=$1) AS tenant,count(*) FILTER(WHERE tenant_id=$1 AND site_id=$2) AS site FROM crawl WHERE state='running'`,[j.tenant_id,j.site_id])).rows[0];
      if(Number(active.total)>=10 || Number(active.tenant)>=2 || Number(active.site)>=1){await c.query('ROLLBACK TO SAVEPOINT candidate');continue;}
      await c.query("UPDATE crawl SET state='running',started_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 WHERE tenant_id=$1 AND id=$2",[j.tenant_id,j.crawl_id]);
     }
     await this.live(c,j.tenant_id,j.site_id,j.crawl_id);await eligible(c,j.release_digest,false);
     const token=randomUUID(),attemptId=randomUUID(),attempt=Number(j.attempt)+1;
     await c.query("UPDATE job SET state='leased',attempt=$3,lease_token=$4,lease_until=least(clock_timestamp()+interval '30 seconds',deadline),error=NULL WHERE tenant_id=$1 AND job_id=$2",[j.tenant_id,j.job_id,attempt,token]);
     await c.query('INSERT INTO job_attempt VALUES($1,$2,$3,$4,clock_timestamp(),NULL,NULL,$5)',[j.tenant_id,j.job_id,attempt,attemptId,j.expected_input_hash]);
     await c.query('INSERT INTO control.scheduler_turn VALUES($1,nextval(\'control.dispatch_turn\')) ON CONFLICT(tenant_id) DO UPDATE SET last_dispatch=excluded.last_dispatch',[j.tenant_id]);
     await event(c,j.tenant_id,j.site_id,j.crawl_id,j.crawl_id,'crawl.started',{crawl_id:j.crawl_id,job_id:j.job_id});
     return {tenantId:j.tenant_id,siteId:j.site_id,runId:j.crawl_id,jobId:j.job_id,token,attempt,attemptId};
    }catch(e){
     await c.query('ROLLBACK TO SAVEPOINT candidate');
     if (!(e instanceof Error) || !['scope_denied','run_fenced','deleted_scope','deadline','skill_revoked','skill_stale','skill_deprecated','skill_unapproved'].includes(e.message)) throw e;
     // Invalid grants/releases are terminal. Permission lookup failure never becomes remote work.
     await c.query("SELECT set_config('app.tenant_id',$1,true)",[j.tenant_id]);
     await c.query("UPDATE job SET state='failed',lease_token=NULL,lease_until=NULL,error=$3 WHERE tenant_id=$1 AND job_id=$2",[j.tenant_id,j.job_id,{code:'policy_blocked',retryable:false,detail:e.message,evidence_ids:[]}]);
    }
   }
   return null;
  });
 }
 private async leased(c:PoolClient,l:Lease){
  for(const id of [l.tenantId,l.siteId,l.runId,l.jobId,l.token,l.attemptId])uuid(id);
  await c.query("SELECT set_config('app.tenant_id',$1,true)",[l.tenantId]);
  const r=await this.live(c,l.tenantId,l.siteId,l.runId);
  const j=(await c.query("SELECT * FROM job WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3 AND job_id=$4 AND state='leased' AND lease_token=$5 AND lease_until>clock_timestamp() AND deadline>clock_timestamp() AND attempt=$6 FOR UPDATE",[l.tenantId,l.siteId,l.runId,l.jobId,l.token,l.attempt])).rows[0];
  if(!j || !(await c.query('SELECT 1 FROM job_attempt WHERE tenant_id=$1 AND job_id=$2 AND attempt_no=$3 AND attempt_id=$4',[l.tenantId,l.jobId,l.attempt,l.attemptId])).rowCount)throw new Error('lease_lost');
  await eligible(c,j.release_digest,false);return {r,j};
 }
 async heartbeat(l:Lease){return transaction(this.pool,'aios_scheduler',async c=>{await this.locks(c);await this.leased(c,l);await c.query("UPDATE job SET lease_until=least(clock_timestamp()+interval '30 seconds',deadline) WHERE tenant_id=$1 AND job_id=$2",[l.tenantId,l.jobId]);});}
 async reserve(l:Lease,kind:BudgetKind,amount:number):Promise<string>{
  if(!moneyKinds.includes(kind)||!Number.isSafeInteger(amount)||amount<0)throw new Error('invalid_input');
  return transaction(this.pool,'aios_scheduler',async c=>{
   await this.locks(c);const {r}=await this.leased(c,l);
   const totals=(await c.query(`SELECT coalesce(sum(CASE WHEN state='settled' THEN actual ELSE amount END),0) AS tenant,
    coalesce(sum(CASE WHEN state='settled' THEN actual ELSE amount END) FILTER(WHERE crawl_id=$2),0) AS run FROM budget_reservation WHERE tenant_id=$1 AND kind=$3`,[l.tenantId,l.runId,kind])).rows[0];
   const cap=(await c.query('SELECT amount FROM control.tenant_cap WHERE tenant_id=$1 AND kind=$2',[l.tenantId,kind])).rows[0];
   if(!cap || Number(totals.run)+amount>r.budget[kind] || Number(totals.tenant)+amount>Number(cap.amount))throw new Error('budget_exhausted');
   const id=randomUUID();await c.query("INSERT INTO budget_reservation VALUES($1,$2,$3,$4,$5,$6,$7,NULL,'reserved',NULL)",[l.tenantId,l.runId,l.jobId,l.attempt,id,kind,amount]);return id;
  });
 }
 async settle(l:Lease,id:string,actual:number){
  uuid(id);if(!Number.isSafeInteger(actual)||actual<0)throw new Error('invalid_input');
  return transaction(this.pool,'aios_scheduler',async c=>{
   await this.locks(c);await c.query("SELECT set_config('app.tenant_id',$1,true)",[l.tenantId]);
   // Accounting is permitted after cancellation/expiry; it never authorizes a result or remote dispatch.
   const r=(await c.query('SELECT * FROM budget_reservation WHERE tenant_id=$1 AND reservation_id=$2 AND job_id=$3 AND attempt_no=$4 FOR UPDATE',[l.tenantId,id,l.jobId,l.attempt])).rows[0];
   if(!r||actual>Number(r.amount))throw new Error('invalid_receipt');
   const digest=manifestHash({id,actual});if(r.state==='settled'){if(r.receipt_hash!==digest)throw new Error('conflict');return;}
   await c.query("UPDATE budget_reservation SET state='settled',actual=$3,receipt_hash=$4 WHERE tenant_id=$1 AND reservation_id=$2",[l.tenantId,id,actual,digest]);
  });
 }
 /** Deterministic persistence projection; never a discovery/network or SEO inference handler. */
 async projectHttpFixture(l:Lease,observationId:string):Promise<string>{
  uuid(observationId);
  if(!this.artifacts)throw new Error('artifact_adapter_required');
  return transaction(this.pool,'aios_scheduler',async c=>{
   await this.locks(c);const {j}=await this.leased(c,l);
   if(j.kind!=='project')throw new Error('handler_not_installed');
   const accepted=(await c.query('SELECT * FROM http_fixture_acceptance WHERE tenant_id=$1 AND site_id=$2 AND observation_id=$3',[l.tenantId,l.siteId,observationId])).rows[0];
   if(!accepted?.body_evidence_id)throw new Error('snapshot_unavailable');
   const rows=(await c.query("SELECT * FROM evidence WHERE tenant_id=$1 AND site_id=$2 AND id=ANY($3::uuid[]) AND state='available' AND expires_at>clock_timestamp()",[l.tenantId,l.siteId,[accepted.body_evidence_id,accepted.receipt_evidence_id]])).rows;
   if(rows.length!==2)throw new Error('snapshot_unavailable');
   const evidence=rows.find(r=>r.id===accepted.body_evidence_id)!,receiptEvidence=rows.find(r=>r.id===accepted.receipt_evidence_id)!;
   const observation=(await c.query("SELECT * FROM observation WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND state IN ('observed','partial') AND fresh_until>clock_timestamp()",[l.tenantId,l.siteId,observationId])).rows[0];
   if(!observation || receiptEvidence.mime_type!=='application/json' || !['text/html','application/xhtml+xml'].includes(evidence.mime_type))throw new Error('snapshot_unavailable');
   const bundle=(await c.query("SELECT * FROM evidence_bundle WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND state='frozen'",[l.tenantId,l.siteId,j.input_ref])).rows[0];
   const links=(await c.query('SELECT field_name,target_id FROM record_link WHERE tenant_id=$1 AND owner_id=$2',[l.tenantId,j.input_ref])).rows;
   if(!bundle || Number(bundle.known_seq)<Math.max(Number(observation.knowledge_seq),Number(evidence.knowledge_seq),Number(receiptEvidence.knowledge_seq)) ||
    !links.some(r=>r.field_name==='observation_ids'&&r.target_id===observationId) ||
    ![evidence.id,receiptEvidence.id].every(id=>links.some(r=>r.field_name==='evidence_ids'&&r.target_id===id)))throw new Error('bundle_membership_required');
   const body=await this.artifacts!.read(evidence.artifact_key,evidence.sha256,Number(evidence.bytes));
   const bytes=await this.artifacts!.read(receiptEvidence.artifact_key,receiptEvidence.sha256,Number(receiptEvidence.bytes));
   if(hash(body)!==evidence.sha256 || body.length!==Number(evidence.bytes) || hash(bytes)!==receiptEvidence.sha256 || bytes.length!==Number(receiptEvidence.bytes) || observation.context_hash!==hash(bytes))throw new Error('artifact_integrity_failed');
   const receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));validate(base+'http-receipt.schema.json',receipt);
   if(receipt.body_evidence_id!==evidence.id || receipt.status_code===null || receipt.status_code>=300&&receipt.status_code<400 || receipt.method!=='GET' || receipt.url!==receipt.final_url || receipt.final_url!==evidence.source_uri || receiptEvidence.source_uri!==evidence.source_uri)throw new Error('snapshot_unavailable');
   // File reads precede the database knowledge-clock lock. Recheck the lease after I/O.
   await this.leased(c,l);
   const snapshot=(await c.query('SELECT control.project_http_fixture($1,$2,$3,$4,$5,$6) AS id',[l.jobId,l.token,l.attempt,l.attemptId,observationId,bytes.toString('utf8')])).rows[0].id;
   await c.query("UPDATE job SET state='completed',lease_token=NULL,lease_until=NULL,result_ref=$3 WHERE tenant_id=$1 AND job_id=$2",[l.tenantId,l.jobId,snapshot]);
   await c.query("UPDATE job_attempt SET ended_at=clock_timestamp(),outcome='completed' WHERE tenant_id=$1 AND job_id=$2 AND attempt_no=$3",[l.tenantId,l.jobId,l.attempt]);
   await event(c,l.tenantId,l.siteId,l.runId,l.runId,'job.completed',{job_id:l.jobId,result_ref:snapshot},2);
   return snapshot;
  });
 }
 async complete(l:Lease,result:string){uuid(result);return transaction(this.pool,'aios_scheduler',async c=>{
  await this.locks(c);await this.leased(c,l);
  // M2 completion validates an existing frozen input/output bundle. Domain-producing handlers are installed in later milestones.
  if(!(await c.query("SELECT 1 FROM evidence_bundle WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND state='frozen'",[l.tenantId,l.siteId,result])).rowCount)throw new Error('schema_invalid');
  await c.query("UPDATE job SET state='completed',lease_token=NULL,lease_until=NULL,result_ref=$3 WHERE tenant_id=$1 AND job_id=$2",[l.tenantId,l.jobId,result]);
  await c.query("UPDATE job_attempt SET ended_at=clock_timestamp(),outcome='completed' WHERE tenant_id=$1 AND job_id=$2 AND attempt_no=$3",[l.tenantId,l.jobId,l.attempt]);
  await event(c,l.tenantId,l.siteId,l.runId,l.runId,'job.completed',{job_id:l.jobId,result_ref:result},2);
 });}
 async fail(l:Lease,code:string,retryable:boolean,retryAfterSeconds=0){
  const error={code,retryable,detail:code,evidence_ids:[]};validate(base+'common.schema.json#/$defs/error',error);
  if(!Number.isSafeInteger(retryAfterSeconds)||retryAfterSeconds<0)throw new Error('invalid_input');
  return transaction(this.pool,'aios_scheduler',async c=>{
   await this.locks(c);await this.leased(c,l);
   const retry=retryable && ['timeout','source_unavailable','model_unavailable'].includes(code);
   const state=retry?(l.attempt<3?'retry_wait':'dead_letter'):'failed';
   const delay=Math.max(retryAfterSeconds,randomInt(0,Math.min(30,2**l.attempt)*1000+1)/1000);
   await c.query("UPDATE job SET state=$3,lease_token=NULL,lease_until=NULL,error=$4,available_at=clock_timestamp()+$5*interval '1 second' WHERE tenant_id=$1 AND job_id=$2",[l.tenantId,l.jobId,state,error,delay]);
   await c.query('UPDATE job_attempt SET ended_at=clock_timestamp(),outcome=$4 WHERE tenant_id=$1 AND job_id=$2 AND attempt_no=$3',[l.tenantId,l.jobId,l.attempt,state]);
   await event(c,l.tenantId,l.siteId,l.runId,l.runId,'job.failed',{job_id:l.jobId,error,terminal:state!=='retry_wait'});
  });
 }
 async cancel(p:Principal,site:string,run:string){uuid(run);return transaction(this.pool,'aios_runtime',async c=>{
  await this.locks(c);await scope(c,p,site);
  const r=(await c.query('SELECT state FROM crawl WHERE tenant_id=$1 AND site_id=$2 AND id=$3',[p.tenantId,site,run])).rows[0];
  if(!r)throw new Error('not_found');if(['complete_in_scope','partial','failed','cancelled'].includes(r.state))return;
  await c.query("UPDATE crawl SET state='cancelled',completed_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 WHERE tenant_id=$1 AND id=$2",[p.tenantId,run]);
  await c.query("UPDATE job SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE tenant_id=$1 AND crawl_id=$2 AND state IN ('queued','retry_wait','leased')",[p.tenantId,run]);
  await c.query("INSERT INTO work_audit(tenant_id,site_id,id,crawl_id,operation) VALUES($1,$2,$3,$4,'cancel')",[p.tenantId,site,randomUUID(),run]);
 });}
 async sweep(){return transaction(this.pool,'aios_scheduler',async c=>{
  await this.locks(c);
  const rows=(await c.query("SELECT * FROM job WHERE state IN ('queued','retry_wait','leased') AND (deadline<=clock_timestamp() OR (state='leased' AND lease_until<=clock_timestamp()))")).rows;
  for(const j of rows){
   await c.query("SELECT set_config('app.tenant_id',$1,true)",[j.tenant_id]);
   const expired=(await c.query('SELECT $1::timestamptz<=clock_timestamp() AS expired',[j.deadline])).rows[0].expired;
   const state=expired?'failed':j.attempt>=3?'dead_letter':'retry_wait';
   await c.query("UPDATE job SET state=$3,lease_token=NULL,lease_until=NULL,available_at=clock_timestamp(),error=$4 WHERE tenant_id=$1 AND job_id=$2",[j.tenant_id,j.job_id,state,{code:'lease_lost',retryable:state==='retry_wait',detail:expired?'deadline':'lease_expired',evidence_ids:[]}]);
   await c.query('UPDATE job_attempt SET ended_at=clock_timestamp(),outcome=$4 WHERE tenant_id=$1 AND job_id=$2 AND attempt_no=$3',[j.tenant_id,j.job_id,j.attempt,state]);
   if(expired)await c.query("UPDATE crawl SET state='failed',completion_reason='deadline',completed_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND state IN ('queued','running')",[j.tenant_id,j.crawl_id]);
  }return rows.length;
 });}
}
