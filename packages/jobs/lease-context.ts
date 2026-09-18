import type { PoolClient } from 'pg';
import { uuid } from '../contracts/index.js';
import { scope,registryLock,workLock } from '../persistence/transaction.js';
import { eligible } from '../skills/index.js';
import type { DeletionLedger } from '../policy/deletion.js';
import type { Lease } from './index.js';
/** Internal transaction gates, shared without adding dispatch/result authority. */
export async function lockGovernedWork(c:PoolClient){
  await c.query('SELECT pg_advisory_xact_lock_shared($1)',[registryLock]);
  await c.query('SELECT pg_advisory_xact_lock($1)',[workLock]);
 }
export async function assertWorkHealth(c:PoolClient){
  if(!(await c.query("SELECT 1 FROM control.health WHERE singleton AND policy_version='discovery-v1' AND verified_until>clock_timestamp() AND restore_ready")).rowCount)throw new Error('policy_unavailable');
 }
export async function requireLiveRun(c:PoolClient,tenant:string,site:string,run:string,deletions:DeletionLedger){
  if(await deletions.contains(tenant,site))throw new Error('deleted_scope');
  const r=(await c.query(`SELECT r.*,t.deletion_epoch,f.deletion_epoch AS pinned_epoch,f.quarantined FROM crawl r JOIN tenant t ON t.id=r.tenant_id
    JOIN work_fence f ON f.tenant_id=r.tenant_id AND f.crawl_id=r.id WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.id=$3 FOR UPDATE OF r`,[tenant,site,run])).rows[0];
  if(!r || r.state!=='running' || r.quarantined || r.pinned_epoch!==r.deletion_epoch)throw new Error('run_fenced');
  await scope(c,{tenantId:tenant,userId:r.submitted_by},site);
  if((await c.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[r.budget.deadline])).rows[0].expired)throw new Error('deadline');
  await assertWorkHealth(c);return r;
 }
export async function requireLease(c:PoolClient,l:Lease,deletions:DeletionLedger){
  for(const id of [l.tenantId,l.siteId,l.runId,l.jobId,l.token,l.attemptId])uuid(id);
  await c.query("SELECT set_config('app.tenant_id',$1,true)",[l.tenantId]);
  const r=await requireLiveRun(c,l.tenantId,l.siteId,l.runId,deletions);
  const j=(await c.query("SELECT * FROM job WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3 AND job_id=$4 AND state='leased' AND lease_token=$5 AND lease_until>clock_timestamp() AND deadline>clock_timestamp() AND attempt=$6 FOR UPDATE",[l.tenantId,l.siteId,l.runId,l.jobId,l.token,l.attempt])).rows[0];
  if(!j || !(await c.query('SELECT 1 FROM job_attempt WHERE tenant_id=$1 AND job_id=$2 AND attempt_no=$3 AND attempt_id=$4',[l.tenantId,l.jobId,l.attempt,l.attemptId])).rowCount)throw new Error('lease_lost');
  await eligible(c,j.release_digest,false);return {r,j};
 }
