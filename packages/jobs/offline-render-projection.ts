import type {Pool} from 'pg';
import type {LocalBlobs} from '../evidence/index.js';
import {base,validate,hash,manifestHash,uuid} from '../contracts/index.js';
import {transaction} from '../persistence/transaction.js';
import type {DeletionLedger} from '../policy/deletion.js';
import {assertInputsEligible} from '../policy/input-eligibility.js';
import {eligible} from '../skills/index.js';
import {assertOfflineRenderRelease} from '../skills/offline-render.js';
import {lockGovernedWork,requireLease,requireLiveRun} from './lease-context.js';
import {readRenderDescriptor} from './offline-render-job.js';
import {resolveOfflineRenderSource} from './offline-render-source.js';
import type {Lease} from './index.js';
export interface OfflineRenderProjection {invocationId:string;observationId:string;renderSnapshotIds:string[];result:'partial'|'failed'}
const output=(row:any):OfflineRenderProjection=>({invocationId:row.invocation_id,observationId:row.observation_id,renderSnapshotIds:row.render_snapshot_ids,result:row.result});
/** Projects only retained privacy-limited artifacts, never reconstructs raw DOM,
 * executes a browser, creates resource URLs or infers semantic parity. */
export async function projectOfflineRenderFixture(pool:Pool,deletions:DeletionLedger,blobs:Pick<LocalBlobs,'read'>|undefined,l:Lease,observationId:string):Promise<OfflineRenderProjection>{
 uuid(observationId);if(!blobs)throw new Error('artifact_adapter_required');
 const gate=async(c:import('pg').PoolClient)=>{
  await lockGovernedWork(c);await c.query("SELECT set_config('app.tenant_id',$1,true)",[l.tenantId]);
  await requireLiveRun(c,l.tenantId,l.siteId,l.runId,deletions);
  const j=(await c.query('SELECT * FROM job WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3 AND job_id=$4',[l.tenantId,l.siteId,l.runId,l.jobId])).rows[0];
  if(!j)throw new Error('lease_lost');if(j.kind!=='render')throw new Error('handler_not_installed');
  const prior=(await c.query('SELECT * FROM render_fixture_projection WHERE tenant_id=$1 AND job_id=$2',[l.tenantId,l.jobId])).rows[0];
  const accepted=(await c.query(`SELECT x.*,h.attempt_no,h.attempt_id,h.lease_token,h.page_snapshot_id,h.bundle_id,h.input_sha256,h.profile,h.source_context_hash,z.started_at,z.finished_at
   FROM render_fixture_acceptance x JOIN render_reservation h ON h.tenant_id=x.tenant_id AND h.invocation_id=x.invocation_id
   JOIN render_terminal_receipt z ON z.tenant_id=x.tenant_id AND z.receipt_id=x.terminal_receipt_id
   WHERE x.tenant_id=$1 AND x.site_id=$2 AND x.crawl_id=$3 AND x.job_id=$4 AND x.observation_id=$5 AND h.settled_at IS NOT NULL`,[l.tenantId,l.siteId,l.runId,l.jobId,observationId])).rows[0];
  if(!accepted)throw new Error('snapshot_unavailable');
  if(accepted.attempt_no!==l.attempt||accepted.attempt_id!==l.attemptId||accepted.lease_token!==l.token)throw new Error('lease_lost');
  if(prior){if(j.state!=='completed'||j.result_ref!==observationId||prior.observation_id!==observationId||prior.invocation_id!==accepted.invocation_id)throw new Error('conflict');await eligible(c,j.release_digest,false);}
  else await requireLease(c,l,deletions);
  await assertOfflineRenderRelease(c,j.release_digest);const descriptor=await readRenderDescriptor(c,j);
  if(!(await c.query("SELECT 1 FROM tenant WHERE id=$1 AND policy_profile_id='local-synthetic-v1'",[l.tenantId])).rowCount)throw new Error('policy_blocked');
  const source=await resolveOfflineRenderSource(c,l,descriptor.bundleId,descriptor.pageSnapshotId);
  if(source.fingerprint!==descriptor.sourceContextHash||accepted.page_snapshot_id!==descriptor.pageSnapshotId||accepted.bundle_id!==descriptor.bundleId||accepted.source_context_hash!==descriptor.sourceContextHash||accepted.input_sha256!==descriptor.inputSha256)throw new Error('source_context_changed');
  const ids=[accepted.receipt_evidence_id,...accepted.dom_evidence_ids];
  const artifacts=(await c.query("SELECT * FROM evidence WHERE tenant_id=$1 AND site_id=$2 AND id=ANY($3::uuid[]) AND state='available' AND deleted_at IS NULL AND expires_at>clock_timestamp() ORDER BY id",[l.tenantId,l.siteId,ids])).rows;
  const observation=(await c.query("SELECT * FROM observation WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND deleted_at IS NULL AND state IN ('partial','failed') AND fresh_until>clock_timestamp()",[l.tenantId,l.siteId,observationId])).rows[0];
  const links=(await c.query("SELECT target_id FROM record_link WHERE tenant_id=$1 AND owner_id=$2 AND field_name='evidence_ids' ORDER BY ordinal",[l.tenantId,observationId])).rows.map(x=>x.target_id);
  if(artifacts.length!==ids.length||!observation||observation.subject_id!==descriptor.pageSnapshotId||manifestHash(ids)!==manifestHash(links))throw new Error('snapshot_unavailable');
  await assertInputsEligible(c,l.tenantId,l.siteId,l.runId,[...source.ids,observationId,...ids,...(prior?.render_snapshot_ids??[])]);
  const context={accepted,artifacts,observation,links,descriptor};
  return {...context,prior,fingerprint:manifestHash(JSON.parse(JSON.stringify(context)))};
 };
 const initial=await transaction(pool,'aios_scheduler',gate);
 // Accepted artifacts are read without work/clock/database locks.
 const bytes=new Map(await Promise.all(initial.artifacts.map(async row=>{
  const data=await blobs.read(row.artifact_key,row.sha256,Number(row.bytes));
  if(hash(data)!==row.sha256||data.byteLength!==Number(row.bytes))throw new Error('artifact_integrity_failed');return [row.id,data] as const;
 })));
 const receipt=initial.artifacts.find(x=>x.id===initial.accepted.receipt_evidence_id)!;
 if(receipt.mime_type!=='application/json'||receipt.redaction_version!=='render-privacy-v1'||initial.observation.context_hash!==receipt.sha256)throw new Error('artifact_integrity_failed');
 const manifestBytes=bytes.get(receipt.id)!;
 let manifest:any;try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes));}catch{throw new Error('schema_invalid');}
 validate(base+'offline-render-retained-manifest.schema.json',manifest);
 const d=initial.descriptor,a=initial.accepted;
 if(manifest.tenant_id!==l.tenantId||manifest.site_id!==l.siteId||manifest.crawl_id!==l.runId||manifest.invocation_id!==a.invocation_id||manifest.page_snapshot_id!==d.pageSnapshotId||manifest.receipt_evidence_id!==receipt.id||manifest.source.evidence_id!==d.rawEvidenceId||manifest.source.sha256!==d.rawSha256||manifest.preparation.input_sha256!==d.inputSha256||Date.parse(manifest.invocation.started_at)!==+new Date(a.started_at)||Date.parse(manifest.invocation.finished_at)!==+new Date(a.finished_at)||manifest.worker.samples.length!==a.dom_evidence_ids.length)throw new Error('artifact_integrity_failed');
 for(const [index,sample] of manifest.worker.samples.entries()){
  const artifact=initial.artifacts.find(x=>x.id===a.dom_evidence_ids[index]);
  if(!artifact||sample.evidence_id!==artifact.id||sample.sha256!==artifact.sha256||sample.bytes!==Number(artifact.bytes)||Date.parse(sample.observedAt)!==+new Date(artifact.captured_at)||artifact.mime_type!=='text/html'||artifact.redaction_version!=='render-privacy-v1')throw new Error('artifact_integrity_failed');
 }
 return transaction(pool,'aios_scheduler',async c=>{
  const current=await gate(c);if(current.fingerprint!==initial.fingerprint)throw new Error('source_context_changed');
  const row=(await c.query('SELECT * FROM control.project_offline_render_fixture($1,$2,$3,$4,$5,$6,$7,$8,$9)',[l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,observationId,manifestBytes.toString('utf8')])).rows[0];
  await assertInputsEligible(c,l.tenantId,l.siteId,l.runId,[observationId,...row.render_snapshot_ids]);
  return output(row);
 });
}
