import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { uuid, manifestHash } from '../contracts/index.js';
import { transaction, scope, registryLock, workLock } from '../persistence/transaction.js';
import { eligible } from '../skills/index.js';
import { normalizeUrl } from '../perception/url.js';
import { DeletionLedger } from '../policy/deletion.js';
import type { Lease } from './index.js';

export interface HttpReservation {
 reservationId:string; invocationId:string; origin:string; maxDecodedBytes:number; startedAt:string; state:'reserved'|'settled';
}
/** Durable accounting only. A receipt is NOT a capability to dispatch a request. */
export class HttpLane {
 constructor(private pool:Pool, private deletions:DeletionLedger){}
 private async locks(c:PoolClient,l:Lease){
  for(const value of [l.tenantId,l.siteId,l.runId,l.jobId,l.token,l.attemptId])uuid(value);
  if(!Number.isSafeInteger(l.attempt)||l.attempt<1||l.attempt>3)throw new Error('invalid_input');
  await c.query('SELECT pg_advisory_xact_lock_shared($1)',[registryLock]);
  await c.query('SELECT pg_advisory_xact_lock($1)',[workLock]);
  await c.query("SELECT set_config('app.tenant_id',$1,true)",[l.tenantId]);
 }
 async reserve(l:Lease,input:{origin:string;maxDecodedBytes:number}):Promise<HttpReservation>{
  if(!Number.isSafeInteger(input.maxDecodedBytes)||input.maxDecodedBytes<1||input.maxDecodedBytes>5242880)throw new Error('invalid_input');
  return transaction(this.pool,'aios_scheduler',async c=>{
   await this.locks(c,l);
   if(await this.deletions.contains(l.tenantId,l.siteId))throw new Error('deleted_scope');
   const r=(await c.query(`SELECT r.*,t.deletion_epoch,f.deletion_epoch AS pinned_epoch,f.quarantined,s.submitted_url
    FROM crawl r JOIN tenant t ON t.id=r.tenant_id JOIN work_fence f ON f.tenant_id=r.tenant_id AND f.crawl_id=r.id
    JOIN site s ON s.tenant_id=r.tenant_id AND s.id=r.site_id
    WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.id=$3 FOR UPDATE OF r`,[l.tenantId,l.siteId,l.runId])).rows[0];
   if(!r||r.state!=='running'||r.quarantined||r.deletion_epoch!==r.pinned_epoch)throw new Error('run_fenced');
   await scope(c,{tenantId:l.tenantId,userId:r.submitted_by},l.siteId);
   if(!(await c.query("SELECT 1 FROM control.health WHERE singleton AND policy_version='discovery-v1' AND verified_until>clock_timestamp() AND restore_ready")).rowCount)throw new Error('policy_unavailable');
   if((await c.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[r.budget.deadline])).rows[0].expired)throw new Error('deadline');
   const j=(await c.query(`SELECT j.* FROM job j JOIN job_attempt a ON a.tenant_id=j.tenant_id AND a.job_id=j.job_id AND a.attempt_no=j.attempt
    WHERE j.tenant_id=$1 AND j.site_id=$2 AND j.crawl_id=$3 AND j.job_id=$4 AND j.state='leased'
    AND j.lease_token=$5 AND j.attempt=$6 AND a.attempt_id=$7 AND j.lease_until>clock_timestamp() AND j.deadline>clock_timestamp() FOR UPDATE OF j`,
    [l.tenantId,l.siteId,l.runId,l.jobId,l.token,l.attempt,l.attemptId])).rows[0];
   if(!j)throw new Error('lease_lost');
   await eligible(c,j.release_digest,false);
   const normalized=normalizeUrl(r.submitted_url);
   if(normalized.excluded||new URL(normalized.url).origin!==input.origin)throw new Error('scope_denied');
   const prior=(await c.query('SELECT * FROM http_reservation WHERE tenant_id=$1 AND job_id=$2 AND attempt_no=$3',[l.tenantId,l.jobId,l.attempt])).rows[0];
   const receipt=(row:any):HttpReservation=>{if(!row.invocation_id)throw new Error('legacy_invocation_unverified');return ({reservationId:row.reservation_id,invocationId:row.invocation_id,origin:row.origin,maxDecodedBytes:Number(row.reserved_bytes),startedAt:new Date(row.started_at).toISOString(),state:row.settled_at===null?'reserved':'settled'});};
   if(prior){if(prior.origin!==input.origin||Number(prior.reserved_bytes)!==input.maxDecodedBytes)throw new Error('conflict');return receipt(prior);}
   const totals=(await c.query(`SELECT count(*) AS attempts,coalesce(sum(reserved_bytes),0) AS bytes FROM http_reservation WHERE tenant_id=$1 AND crawl_id=$2`,[l.tenantId,l.runId])).rows[0];
   const budget=(await c.query(`SELECT coalesce(sum(CASE WHEN state='settled' THEN actual ELSE amount END),0) AS tenant,
    coalesce(sum(CASE WHEN state='settled' THEN actual ELSE amount END) FILTER(WHERE crawl_id=$2),0) AS run
    FROM budget_reservation WHERE tenant_id=$1 AND kind='http_requests'`,[l.tenantId,l.runId])).rows[0];
   const cap=(await c.query("SELECT amount FROM control.tenant_cap WHERE tenant_id=$1 AND kind='http_requests'",[l.tenantId])).rows[0];
   if(Number(totals.attempts)>=750||Number(totals.bytes)+input.maxDecodedBytes>262144000||!cap||Number(budget.run)+1>Math.min(750,r.budget.http_requests)||Number(budget.tenant)+1>Number(cap.amount))throw new Error('budget_exhausted');
   const id=randomUUID();
   // Counter increment, permanent generic charge and reservation commit together.
   const row=(await c.query('SELECT * FROM control.reserve_http_accounting($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,input.origin,input.maxDecodedBytes,id,manifestHash({id,actual:1})])).rows[0];
   return receipt(row);
  });
 }
 async settle(l:Lease,id:string,receiptId:string):Promise<void>{
  uuid(id);uuid(receiptId);
  return transaction(this.pool,'aios_scheduler',async c=>{
   await this.locks(c,l);
   // Only a separately authenticated, immutable supervisor witness can release
   // the slot. Post-cancel accounting accepts no evidence and refunds no budget.
   await c.query('SELECT control.settle_http_terminal($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,id,receiptId]);
  });
 }
}
