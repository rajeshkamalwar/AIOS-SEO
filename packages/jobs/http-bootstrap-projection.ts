import type {Pool,PoolClient} from 'pg';
import type {LocalBlobs} from '../evidence/index.js';
import {base,validate,canonical,hash,manifestHash,uuid} from '../contracts/index.js';
import {transaction} from '../persistence/transaction.js';
import type {DeletionLedger} from '../policy/deletion.js';
import {assertInputsEligible} from '../policy/input-eligibility.js';
import {eligible} from '../skills/index.js';
import {assertHttpBootstrapRelease} from '../skills/http-bootstrap.js';
import {assertReviewedRawFixture,assertReviewedHttpFixtureMetadata} from '../perception/reviewed-fixtures.js';
import {robotsState} from '../perception/robots-admission.js';
import {lockGovernedWork,requireLease,requireLiveRun} from './lease-context.js';
import {readHttpBootstrapDescriptor,resolveHttpBootstrapSource} from './http-bootstrap-job.js';
import type {Lease} from './index.js';
export interface HttpBootstrapProjection {invocationId:string;observationId:string;bodyEvidenceId:string|null;receiptEvidenceId:string;contextHash:string;state:'known'|'denied'|'unknown';reason:'parsed'|'not_available'|'access_denied'|'transport_failed'|'unavailable_or_incomplete'|'parse_failed';policyVersion:'discovery-v1';parserVersion:'robots-v1';freshUntil:string}
/** Completes processing of accepted local robots evidence; grants no page dispatch. */
export async function readHttpBootstrapProjectionInput(pool:Pool,deletions:DeletionLedger,blobs:Pick<LocalBlobs,'read'>|undefined,lease:Lease){
 const l={...lease};[l.tenantId,l.siteId,l.runId,l.jobId,l.token,l.attemptId].forEach(uuid);
 if(!Number.isSafeInteger(l.attempt)||l.attempt<1||l.attempt>3)throw new Error('invalid_input');
 if(!blobs)throw new Error('artifact_adapter_required');
 const gate=(c:PoolClient)=>httpBootstrapProjectionContext(c,l,deletions);
 const initial=await transaction(pool,'aios_scheduler',gate);
 const bytes=new Map(await Promise.all(initial.artifacts.map(async row=>{const b=await blobs.read(row.artifact_key,row.sha256,Number(row.bytes));if(hash(b)!==row.sha256||b.length!==Number(row.bytes))throw new Error('artifact_integrity_failed');return [row.id,b] as const;})));
 const a=initial.accepted,receiptRow=initial.artifacts.find(x=>x.id===a.receipt_evidence_id)!,receiptBytes=bytes.get(receiptRow.id)!;
 const receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(receiptBytes));validate(base+'http-receipt.schema.json',receipt);
 if(!receiptBytes.equals(Buffer.from(canonical(receipt))))throw new Error('unreviewed_fixture');
 const {body_evidence_id,...metadata}=receipt;assertReviewedHttpFixtureMetadata(metadata);
 const body=a.body_evidence_id?bytes.get(a.body_evidence_id)!:null;
 const mime=receipt.headers.find((x:{name:string;value:string})=>x.name==='content-type')?.value.split(';',1)[0].trim().toLowerCase();
 const observedState=receipt.status_code===null?'failed':receipt.error!==null||receipt.truncated?'partial':'observed';
 if(initial.observation.state!==observedState||manifestHash(initial.observation.error)!==manifestHash(receipt.error))throw new Error('artifact_integrity_failed');
 if(receiptRow.source_class!=='first_party_observation'||receiptRow.mime_type!=='application/json'||receiptRow.redaction_version!=='none-v1'||receiptRow.sha256!==initial.observation.context_hash||receiptRow.source_uri!==initial.descriptor.url||body_evidence_id!==a.body_evidence_id||receipt.url!==initial.descriptor.url||receipt.final_url!==receipt.url||receipt.method!=='GET'||+new Date(receiptRow.captured_at)!==+new Date(initial.observation.observed_at)||+new Date(receiptRow.captured_at)<+new Date(a.started_at)||+new Date(receiptRow.captured_at)>+new Date(a.finished_at))throw new Error('artifact_integrity_failed');
 if(body!==null){const row=initial.artifacts.find(x=>x.id===a.body_evidence_id)!;if(row.mime_type!==mime||row.source_class!=='first_party_observation'||row.redaction_version!=='none-v1'||row.source_uri!==receipt.url||+new Date(row.captured_at)!==+new Date(receiptRow.captured_at)||body.length>512000)throw new Error('artifact_integrity_failed');assertReviewedRawFixture({mimeType:row.mime_type,sourceUri:row.source_uri,bytes:body});}
 const decision=robotsState(receipt.status_code===null?null:{status:receipt.status_code,body:mime==='text/plain'&&receipt.error===null?body:null,truncated:receipt.truncated});
 const result:HttpBootstrapProjection={invocationId:a.invocation_id,observationId:a.observation_id,bodyEvidenceId:a.body_evidence_id,receiptEvidenceId:a.receipt_evidence_id,contextHash:receiptRow.sha256,state:decision.state,reason:decision.reason as HttpBootstrapProjection['reason'],policyVersion:'discovery-v1',parserVersion:'robots-v1',freshUntil:new Date(Math.min(+new Date(initial.observation.fresh_until),...initial.artifacts.map(x=>+new Date(x.expires_at)),+new Date(initial.observation.observed_at)+86400000)).toISOString()};
 validate(base+'http-bootstrap-projection.schema.json',result);
 return {initial,result,receipt,body,receiptBytes,l,decision};
}
export async function httpBootstrapProjectionContext(c:PoolClient,l:Lease,deletions:DeletionLedger){
  await lockGovernedWork(c);await c.query("SELECT set_config('app.tenant_id',$1,true)",[l.tenantId]);await requireLiveRun(c,l.tenantId,l.siteId,l.runId,deletions);
  const j=(await c.query('SELECT * FROM job WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3 AND job_id=$4',[l.tenantId,l.siteId,l.runId,l.jobId])).rows[0];
  if(!j)throw new Error('lease_lost');if(j.kind!=='fetch')throw new Error('handler_not_installed');
  const prior=(await c.query('SELECT * FROM http_bootstrap_projection WHERE tenant_id=$1 AND job_id=$2',[l.tenantId,l.jobId])).rows[0];
  const accepted=(await c.query(`SELECT x.*,h.attempt_no,h.attempt_id,h.lease_token,h.origin,z.started_at,z.finished_at,z.result_digest,i.collector_build_digest,i.input_context_hash
   FROM http_bootstrap_acceptance x JOIN http_reservation h ON h.tenant_id=x.tenant_id AND h.invocation_id=x.invocation_id
   JOIN http_invocation i ON i.tenant_id=h.tenant_id AND i.reservation_id=h.reservation_id AND i.invocation_id=h.invocation_id
   JOIN http_terminal_receipt z ON z.tenant_id=x.tenant_id AND z.receipt_id=x.terminal_receipt_id AND z.reservation_id=h.reservation_id AND z.invocation_id=h.invocation_id
   WHERE x.tenant_id=$1 AND x.site_id=$2 AND x.crawl_id=$3 AND x.job_id=$4 AND h.settled_at IS NOT NULL`,[l.tenantId,l.siteId,l.runId,l.jobId])).rows;
  if(accepted.length!==1)throw new Error('source_unavailable');const a=accepted[0];
  if(a.input_hash!==manifestHash({terminalReceiptId:a.terminal_receipt_id,resultDigest:a.result_digest,imageDigest:a.collector_build_digest,inputContextHash:a.input_context_hash}))throw new Error('invalid_receipt');
  if(a.attempt_no!==l.attempt||a.attempt_id!==l.attemptId||a.lease_token!==l.token)throw new Error('lease_lost');
  if(prior){if(j.state!=='completed'||j.result_ref!==a.observation_id||prior.observation_id!==a.observation_id||prior.invocation_id!==a.invocation_id)throw new Error('conflict');await eligible(c,j.release_digest,false);}else await requireLease(c,l,deletions);
  await assertHttpBootstrapRelease(c,j.release_digest);const descriptor=await readHttpBootstrapDescriptor(c,j),source=await resolveHttpBootstrapSource(c,l,j.input_ref);
  if(source.fingerprint!==descriptor.sourceContextHash||a.origin!==descriptor.origin)throw new Error('source_context_changed');
  const ids=[...(a.body_evidence_id?[a.body_evidence_id]:[]),a.receipt_evidence_id];
  const artifacts=(await c.query("SELECT * FROM evidence WHERE tenant_id=$1 AND site_id=$2 AND id=ANY($3::uuid[]) AND state='available' AND deleted_at IS NULL AND expires_at>clock_timestamp() ORDER BY id",[l.tenantId,l.siteId,ids])).rows;
  const observation=(await c.query("SELECT * FROM observation WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND deleted_at IS NULL AND fresh_until>clock_timestamp() AND observed_at>clock_timestamp()-interval '24 hours' AND observed_at<=clock_timestamp()",[l.tenantId,l.siteId,a.observation_id])).rows[0];
  const links=(await c.query("SELECT target_id FROM record_link WHERE tenant_id=$1 AND owner_id=$2 AND field_name='evidence_ids' ORDER BY ordinal",[l.tenantId,a.observation_id])).rows.map(x=>x.target_id);
  const compatible=(await c.query('SELECT * FROM http_fixture_acceptance WHERE tenant_id=$1 AND site_id=$2 AND attempt_id=$3',[l.tenantId,l.siteId,a.invocation_id])).rows[0];
  if(artifacts.length!==ids.length||!observation||observation.sensor_id!=='http-fixture'||observation.sensor_version!=='1.0.0'||observation.subject_id!==l.siteId||observation.attempt_id!==a.invocation_id||manifestHash(ids)!==manifestHash(links)||!compatible||compatible.observation_id!==a.observation_id||compatible.body_evidence_id!==a.body_evidence_id||compatible.receipt_evidence_id!==a.receipt_evidence_id||compatible.input_hash!==a.input_hash)throw new Error('source_unavailable');
  await assertInputsEligible(c,l.tenantId,l.siteId,l.runId,[a.observation_id,...ids]);
  const context={accepted:a,artifacts,observation,links,descriptor,compatible};
  return {...context,prior,fingerprint:manifestHash(JSON.parse(JSON.stringify(context)))};
}

export async function projectHttpBootstrapFixture(pool:Pool,deletions:DeletionLedger,blobs:Pick<LocalBlobs,'read'>|undefined,lease:Lease):Promise<HttpBootstrapProjection>{
 const {initial,result,receiptBytes,body,l}=await readHttpBootstrapProjectionInput(pool,deletions,blobs,lease);
 const gate=(c:PoolClient)=>httpBootstrapProjectionContext(c,l,deletions);
 return transaction(pool,'aios_scheduler',async c=>{
  const current=await gate(c);if(current.fingerprint!==initial.fingerprint)throw new Error('source_context_changed');
  const row=(await c.query('SELECT * FROM control.project_http_bootstrap_fixture($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,receiptBytes.toString('utf8'),body,result])).rows[0];
  validate(base+'http-bootstrap-projection.schema.json',row.result);return row.result;
 });
}
