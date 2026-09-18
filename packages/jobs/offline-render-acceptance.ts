import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {base,validate,hash,manifestHash,uuid} from '../contracts/index.js';
import type {LocalBlobs} from '../evidence/index.js';
import type {DeletionLedger} from '../policy/deletion.js';
import {transaction} from '../persistence/transaction.js';
import {lockGovernedWork,requireLease} from './lease-context.js';
import {readRenderDescriptor,type ReadyOfflineRenderInput,type OfflineRenderJobDescriptor} from './offline-render-job.js';
import {assertOfflineRenderRelease} from '../skills/offline-render.js';
import {resolveOfflineRenderSource} from './offline-render-source.js';
import {parseOfflineRenderResult} from '../perception/render-result.js';
import {buildRetainedOfflineRenderManifest} from '../perception/render-retention.js';
import type {OfflineRenderExecutionReceipt} from './offline-render-producer.js';
import type {Lease} from './index.js';
/** Private trusted host handoff, never a queue/client/worker-controlled command.
 * browserBuild is host configuration associated with the immutable imageDigest. */
export interface OfflineRenderAcceptanceInput {stdout:Uint8Array;receipt:OfflineRenderExecutionReceipt;browserBuild:string;imageDigest:string}
export interface OfflineRenderAcceptance {invocationId:string;receiptEvidenceId:string;domEvidenceIds:string[];observationId:string}
export type RenderArtifacts=Pick<LocalBlobs,'read'> & Partial<Pick<LocalBlobs,'put'|'key'>>;
export async function acceptOfflineRenderFixture(pool:Pool,deletions:DeletionLedger,blobs:RenderArtifacts|undefined,l:Lease,input:OfflineRenderAcceptanceInput,prepare:()=>Promise<{prepared:ReadyOfflineRenderInput;descriptor:OfflineRenderJobDescriptor}>):Promise<OfflineRenderAcceptance>{
 if(!blobs?.put||!blobs.key)throw new Error('artifact_adapter_required');
 if(!input||Object.keys(input).sort().join(',')!=='browserBuild,imageDigest,receipt,stdout'||!(input.stdout instanceof Uint8Array)||input.stdout.byteLength>20971520||typeof input.imageDigest!=='string'||!/^[a-f0-9]{64}$/.test(input.imageDigest)||typeof input.browserBuild!=='string'||input.browserBuild.length<1||input.browserBuild.length>256)throw new Error('schema_invalid');
 const stdout=Buffer.from(input.stdout),receipt=structuredClone(input.receipt),browserBuild=input.browserBuild,imageDigest=input.imageDigest;
 validate(base+'offline-render-execution.schema.json',receipt);uuid(receipt.invocationId);uuid(receipt.terminalReceiptId);
 if(receipt.conformance!=='valid'||hash(stdout)!==receipt.stdoutSha256)throw new Error('render_result_invalid');
 const resultDigest=manifestHash({stdoutSha256:receipt.stdoutSha256,state:receipt.state,conformance:receipt.conformance,workerState:receipt.workerState,evidenceAccepted:false});
 const prepared=await prepare();
 const gate=async(c:PoolClient)=>{
  await lockGovernedWork(c);const {j}=await requireLease(c,l,deletions,false);if(j.kind!=='render')throw new Error('handler_not_installed');
  await assertOfflineRenderRelease(c,j.release_digest);const descriptor=await readRenderDescriptor(c,j);
  if(manifestHash(descriptor)!==manifestHash(prepared.descriptor))throw new Error('source_context_changed');
  const source=await resolveOfflineRenderSource(c,l,j.input_ref,descriptor.pageSnapshotId);
  if(source.fingerprint!==descriptor.sourceContextHash)throw new Error('source_context_changed');
  const row=(await c.query(`SELECT h.reservation_id,i.started_at,i.image_digest,i.container_id,z.finished_at,z.result_digest FROM render_reservation h JOIN render_invocation i ON i.tenant_id=h.tenant_id AND i.reservation_id=h.reservation_id JOIN render_terminal_receipt z ON z.tenant_id=h.tenant_id AND z.reservation_id=h.reservation_id WHERE h.tenant_id=$1 AND h.site_id=$2 AND h.crawl_id=$3 AND h.job_id=$4 AND h.attempt_no=$5 AND h.attempt_id=$6 AND h.lease_token=$7 AND h.invocation_id=$8 AND z.receipt_id=$9 AND h.settled_at IS NOT NULL`,[l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,receipt.invocationId,receipt.terminalReceiptId])).rows[0];
  if(!row||row.result_digest!==resultDigest||row.image_digest!==imageDigest||row.container_id!==receipt.containerId)throw new Error('invalid_receipt');
  const freshness=(await c.query("SELECT min(until) AS until FROM (SELECT fresh_until AS until FROM observation WHERE tenant_id=$1 AND id=ANY($2::uuid[]) UNION ALL SELECT expires_at AS until FROM evidence WHERE tenant_id=$1 AND id=ANY($2::uuid[])) x",[l.tenantId,source.ids])).rows[0];
  return {...row,freshUntil:new Date(freshness.until).toISOString()};
 };
 const witness=await transaction(pool,'aios_render_acceptor',gate);
 const startedAt=new Date(witness.started_at).toISOString(),finishedAt=new Date(witness.finished_at).toISOString();
 const result=parseOfflineRenderResult(stdout,{url:prepared.prepared.url,inputSha256:prepared.prepared.inputSha256,browserBuild,startedAt,finishedAt});
 if(result.state!==receipt.workerState)throw new Error('invalid_receipt');
 const receiptId=randomUUID(),domIds=result.samples.map(()=>randomUUID()),observationId=randomUUID();
 const retained=await buildRetainedOfflineRenderManifest({stdout,result,prepared:prepared.prepared,context:{tenantId:l.tenantId,siteId:l.siteId,crawlId:l.runId,pageSnapshotId:prepared.descriptor.pageSnapshotId,invocationId:receipt.invocationId,startedAt,finishedAt,browserBuild},receiptEvidenceId:receiptId,domEvidenceIds:domIds});
 // Allocation identities do not change logical invocation idempotency.
 const aliases=new Map<string,string>([[receiptId,'$receipt'],...domIds.map((id,i)=>[id,'$dom'+i] as [string,string])]);
 const logical=JSON.parse(JSON.stringify(retained.manifest,(_k,v)=>typeof v==='string'?(aliases.get(v)??v):v));
 const inputHash=manifestHash({terminalReceiptId:receipt.terminalReceiptId,resultDigest,imageDigest,browserBuild,retained:logical});
 const prior=await transaction(pool,'aios_render_acceptor',async c=>{
  await gate(c);const row=(await c.query('SELECT * FROM render_fixture_acceptance WHERE tenant_id=$1 AND invocation_id=$2',[l.tenantId,receipt.invocationId])).rows[0];
  if(row&&row.input_hash!==inputHash)throw new Error('conflict');return row;
 });
 if(prior)return {invocationId:receipt.invocationId,receiptEvidenceId:prior.receipt_evidence_id,domEvidenceIds:prior.dom_evidence_ids,observationId:prior.observation_id};
 const artifacts=[{id:receiptId,bytes:retained.manifestBytes,mime:'application/json',capturedAt:finishedAt},...retained.domArtifacts.map((a,i)=>({id:a.evidenceId,bytes:a.bytes,mime:'text/html',capturedAt:result.samples[i]!.observedAt}))];
 return transaction(pool,'aios_render_acceptor',async c=>{
  // Shared maintenance fence prevents orphan sweep deleting staged objects.
  // No work or tenant knowledge-clock lock is held during these uploads.
  await c.query('SELECT pg_advisory_xact_lock_shared(68273431)');
  for(const artifact of artifacts){if(artifact.bytes.byteLength>5242880)throw new Error('response_too_large');await blobs.put!(blobs.key!(l.tenantId,l.siteId,artifact.id),artifact.bytes);}
  const current=await gate(c);
  const payload={manifestText:retained.manifestBytes.toString('utf8'),operational:receipt,freshUntil:current.freshUntil,inputHash,receiptId,domIds,observationId,sourceUri:new URL(prepared.prepared.url).origin+new URL(prepared.prepared.url).pathname,observedAt:finishedAt,manifestSha:hash(retained.manifestBytes),state:['captured','policy_limited'].includes(result.state)?'partial':'failed',artifacts:artifacts.map(a=>({id:a.id,key:blobs.key!(l.tenantId,l.siteId,a.id),sha256:hash(a.bytes),bytes:a.bytes.byteLength,mime:a.mime,capturedAt:a.capturedAt}))};
  const row=(await c.query('SELECT * FROM control.accept_offline_render_fixture($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,receipt.invocationId,receipt.terminalReceiptId,resultDigest,payload])).rows[0];
  return {invocationId:receipt.invocationId,receiptEvidenceId:row.receipt_evidence_id,domEvidenceIds:row.dom_evidence_ids,observationId:row.observation_id};
 });
}
