import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {base,validate,canonical,hash,manifestHash,uuid} from '../contracts/index.js';
import type {HttpFixtureResult} from '../persistence/index.js';
import type {DeletionLedger} from '../policy/deletion.js';
import {transaction} from '../persistence/transaction.js';
import {assertReviewedRawFixture,assertReviewedHttpFixtureMetadata} from '../perception/reviewed-fixtures.js';
import {lockGovernedWork,requireLease} from './lease-context.js';
import {readHttpBootstrapDescriptor,resolveHttpBootstrapSource,type HttpBootstrapJobDescriptor} from './http-bootstrap-job.js';
import {assertHttpBootstrapRelease} from '../skills/http-bootstrap.js';
import type {HttpFixtureMetadata} from './docker-http-fixture.js';
import type {RenderArtifacts} from './offline-render-acceptance.js';
import type {Lease} from './index.js';
/** Private independently supervised host handoff, never worker/client JSON. */
export interface HttpBootstrapAcceptanceInput {
 invocationId:string;terminalReceiptId:string;containerId:string;imageDigest:string;fixturePort:number;
 observedAt:string;result:HttpFixtureResult;body:Uint8Array|null;
 transcript:{workerConformance:'valid'|'invalid';stdoutSha256:string;state:string;exitCode:number|null;brokerClosedAt:string;protocolViolation:boolean;brokerResult:HttpFixtureMetadata|null};
}
export interface HttpBootstrapAcceptance {invocationId:string;bodyEvidenceId:string|null;receiptEvidenceId:string;observationId:string}
export async function acceptHttpBootstrapFixture(pool:Pool,deletions:DeletionLedger,blobs:RenderArtifacts|undefined,lease:Lease,input:HttpBootstrapAcceptanceInput,prepare:()=>Promise<HttpBootstrapJobDescriptor>):Promise<HttpBootstrapAcceptance>{
 if(!blobs?.put||!blobs.key)throw new Error('artifact_adapter_required');
 if(!input||Object.keys(input).sort().join(',')!=='body,containerId,fixturePort,imageDigest,invocationId,observedAt,result,terminalReceiptId,transcript'||!(input.body===null||input.body instanceof Uint8Array))throw new Error('schema_invalid');
 if(input.body!==null&&input.body.byteLength>512000)throw new Error('schema_invalid');
 const l={...lease},body=input.body===null?null:Buffer.from(input.body),data=structuredClone({...input,body:null});
 const {result,transcript}=data;[data.invocationId,data.terminalReceiptId].forEach(uuid);
 if(!/^[a-f0-9]{64}$/.test(data.containerId)||!/^[a-f0-9]{64}$/.test(data.imageDigest)||!Number.isSafeInteger(data.fixturePort)||data.fixturePort<1||data.fixturePort>65535||body&&body.length>512000)throw new Error('schema_invalid');
 if(!transcript||typeof transcript!=='object')throw new Error('schema_invalid');
 validate(base+'common.schema.json#/$defs/time',data.observedAt);validate(base+'common.schema.json#/$defs/time',transcript.brokerClosedAt);
 if(new Date(data.observedAt).toISOString()!==data.observedAt||new Date(transcript.brokerClosedAt).toISOString()!==transcript.brokerClosedAt||!transcript||Object.keys(transcript).sort().join(',')!=='brokerClosedAt,brokerResult,exitCode,protocolViolation,state,stdoutSha256,workerConformance'||!/^[a-f0-9]{64}$/.test(transcript.stdoutSha256)||!['exited','timeout','aborted','failed','output_limit','protocol_error'].includes(transcript.state)||!(transcript.exitCode===null||Number.isSafeInteger(transcript.exitCode))||typeof transcript.protocolViolation!=='boolean'||!['valid','invalid'].includes(transcript.workerConformance))throw new Error('schema_invalid');
 validate(base+'http-receipt.schema.json',{...result,body_evidence_id:null});assertReviewedHttpFixtureMetadata(result);
 const mime=result.headers.find(h=>h.name==='content-type')?.value.split(';',1)[0]!.trim().toLowerCase();
 if(result.method!=='GET'||result.url!==result.final_url||body!==null&&(!mime||result.status_code===null||[204,205,304].includes(result.status_code))||result.status_code===null&&result.error===null||result.truncated&&body===null)throw new Error('schema_invalid');
 if(body!==null)assertReviewedRawFixture({mimeType:mime!,sourceUri:result.final_url,bytes:body});
 if(transcript.protocolViolation)throw new Error('invalid_receipt');
 if(result.status_code===null){
  if(transcript.brokerResult!==null||!['failed','timeout','exited'].includes(transcript.state)||body!==null)throw new Error('invalid_receipt');
 }else{
  const expected={status:result.status_code,truncated:result.truncated,retainedBodyBytes:body?.length??0,retainedBodySha256:body===null?null:hash(body)};
  if(transcript.workerConformance!=='valid'||transcript.state!=='exited'||transcript.exitCode!==0||manifestHash(transcript.brokerResult)!==manifestHash(expected))throw new Error('invalid_receipt');
 }
 const rawReceipt=canonical({...result,body_evidence_id:null});
 const capture={observedAt:data.observedAt,receiptSha256:hash(Buffer.from(rawReceipt)),bodySha256:body===null?null:hash(body),bodyBytes:body===null?null:body.length};
 const terminalText=canonical({profile:'isolated-http-fixture-v1',containerId:data.containerId,...transcript,capture}),resultDigest=hash(Buffer.from(terminalText));
 const descriptor=await prepare();
 if(result.url!==descriptor.url)throw new Error('scope_denied');
 const expectedContext=manifestHash({profile:'isolated-http-fixture-v1',containerId:data.containerId,descriptor,task:{url:descriptor.url,fixturePort:data.fixturePort,maxDecodedBytes:descriptor.maxDecodedBytes,timeoutMs:descriptor.timeoutMs}});
 const gate=async(c:PoolClient)=>{
  await lockGovernedWork(c);const {j}=await requireLease(c,l,deletions,false);if(j.kind!=='fetch')throw new Error('handler_not_installed');
  await assertHttpBootstrapRelease(c,j.release_digest);const d=await readHttpBootstrapDescriptor(c,j);
  if(manifestHash(d)!==manifestHash(descriptor))throw new Error('source_context_changed');
  const source=await resolveHttpBootstrapSource(c,l,j.input_ref);if(source.fingerprint!==d.sourceContextHash)throw new Error('source_context_changed');
  const row=(await c.query(`SELECT h.reservation_id,i.started_at,i.collector_build_digest,i.input_context_hash,z.finished_at,z.result_digest FROM http_reservation h JOIN http_invocation i ON i.tenant_id=h.tenant_id AND i.reservation_id=h.reservation_id JOIN http_terminal_receipt z ON z.tenant_id=h.tenant_id AND z.reservation_id=h.reservation_id WHERE h.tenant_id=$1 AND h.site_id=$2 AND h.crawl_id=$3 AND h.job_id=$4 AND h.attempt_no=$5 AND h.attempt_id=$6 AND h.lease_token=$7 AND h.invocation_id=$8 AND z.receipt_id=$9 AND h.settled_at IS NOT NULL`,[l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,data.invocationId,data.terminalReceiptId])).rows[0];
  if(!row||row.result_digest!==resultDigest||row.collector_build_digest!==data.imageDigest||row.input_context_hash!==expectedContext||Date.parse(data.observedAt)<+new Date(row.started_at)||Date.parse(data.observedAt)>Date.parse(transcript.brokerClosedAt)||Date.parse(transcript.brokerClosedAt)>+new Date(row.finished_at))throw new Error('invalid_receipt');
  return {freshUntil:new Date(Math.min(+new Date(source.observation.fresh_until),+new Date(source.evidence.expires_at),Date.parse(data.observedAt)+86400000)).toISOString()};
 };
 const inputHash=manifestHash({terminalReceiptId:data.terminalReceiptId,resultDigest,imageDigest:data.imageDigest,inputContextHash:expectedContext});
 const prior=await transaction(pool,'aios_http_acceptor',async c=>{await gate(c);const row=(await c.query('SELECT * FROM http_bootstrap_acceptance WHERE tenant_id=$1 AND invocation_id=$2',[l.tenantId,data.invocationId])).rows[0];if(row&&row.input_hash!==inputHash)throw new Error('conflict');return row;});
 const output=(row:any):HttpBootstrapAcceptance=>{const value={invocationId:data.invocationId,bodyEvidenceId:row.body_evidence_id,receiptEvidenceId:row.receipt_evidence_id,observationId:row.observation_id};validate(base+'http-bootstrap-acceptance.schema.json',value);return value;};
 if(prior)return output(prior);
 const bodyId=body===null?null:randomUUID(),receiptId=randomUUID(),observationId=randomUUID(),receiptText=canonical({...result,body_evidence_id:bodyId});
 const artifacts=[...(body===null?[]:[{id:bodyId!,bytes:body,mime:mime!}]),{id:receiptId,bytes:Buffer.from(receiptText),mime:'application/json'}];
 return transaction(pool,'aios_http_acceptor',async c=>{
  await c.query('SELECT pg_advisory_xact_lock_shared(68273431)');
  for(const a of artifacts)await blobs.put!(blobs.key!(l.tenantId,l.siteId,a.id),a.bytes);
  const current=await gate(c);
  const payload={inputHash,terminalText,rawReceiptText:rawReceipt,receiptText,bodyId,receiptId,observationId,observedAt:data.observedAt,freshUntil:current.freshUntil,sourceUri:descriptor.url,imageDigest:data.imageDigest,inputContextHash:expectedContext,artifacts:artifacts.map(a=>({id:a.id,key:blobs.key!(l.tenantId,l.siteId,a.id),sha256:hash(a.bytes),bytes:a.bytes.length,mime:a.mime}))};
  return output((await c.query('SELECT * FROM control.accept_http_bootstrap_fixture($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,data.invocationId,data.terminalReceiptId,resultDigest,payload])).rows[0]);
 });
}
