import {base,canonical,hash,uuid,validate} from '../contracts/index.js';
import {parseOfflineRenderResult,type OfflineRenderResult} from './render-result.js';
import type {PreparedOfflineRenderInput} from './render-input.js';

export interface OfflineRenderManifestContext {
 tenantId:string;siteId:string;crawlId:string;pageSnapshotId:string;invocationId:string;
 startedAt:string;finishedAt:string;browserBuild:string;
}
export interface OfflineRenderManifestInput {
 result:OfflineRenderResult;stdout:Uint8Array;
 prepared:Extract<PreparedOfflineRenderInput,{state:'prepared'}>;
 context:OfflineRenderManifestContext;receiptEvidenceId:string;domEvidenceIds:string[];
}
/** Pure artifact transformation, not evidence acceptance or supervisor authentication.
 * Caller provides authorized source/preparation context and allocates IDs; this
 * function allocates no identity, writes no blob, and grants no dispatch rights.
 * Manifest v1 replaces embedded DOM with exact per-sample artifact references.
 * Original stdout is identified as a NON-retained transport digest, never falsely
 * presented as the digest of this different, canonical manifest artifact.
 */
export function buildOfflineRenderManifest(input:OfflineRenderManifestInput){
 const {prepared,context}=input;
 if(!prepared||prepared.state!=='prepared'||prepared.profile!=='local-offline-replay-v3'||typeof prepared.html!=='string')throw new Error('schema_invalid');
 if(!(input.stdout instanceof Uint8Array)||input.stdout.byteLength>20971520)throw new Error('render_result_invalid');
 const stdout=Buffer.from(input.stdout),utf8=Buffer.from(prepared.html,'utf8');
 if(utf8.byteLength>5242880)throw new Error('response_too_large');
 if(utf8.toString('utf8')!==prepared.html||utf8.byteLength!==prepared.inputBytes||hash(utf8)!==prepared.inputSha256)throw new Error('artifact_integrity_failed');
 const result=parseOfflineRenderResult(stdout,{url:prepared.url,browserBuild:context.browserBuild,inputSha256:prepared.inputSha256,startedAt:context.startedAt,finishedAt:context.finishedAt});
 if(canonical(result)!==canonical(input.result))throw new Error('artifact_integrity_failed');
 for(const id of [context.tenantId,context.siteId,context.crawlId,context.pageSnapshotId,context.invocationId,prepared.source.evidenceId,input.receiptEvidenceId])uuid(id);
 if(!Array.isArray(input.domEvidenceIds)||input.domEvidenceIds.length!==result.samples.length)throw new Error('schema_invalid');
 const used=new Set([context.tenantId,context.siteId,context.crawlId,context.pageSnapshotId,context.invocationId,prepared.source.evidenceId]);
 for(const id of [input.receiptEvidenceId,...input.domEvidenceIds]){uuid(id);if(used.has(id))throw new Error('schema_invalid');used.add(id);}
 const domArtifacts=result.samples.map((sample,index)=>{
  const bytes=Buffer.from(sample.dom,'utf8');
  // The strict result parser already verified exact UTF-8 roundtrip and bound.
  return {evidenceId:input.domEvidenceIds[index]!,bytes,sha256:hash(bytes)};
 });
 const manifest={
  receipt_type:'offline_render_fixture',schema_version:1,deployment_profile:'local-synthetic-v1',authority:'fixture_only',live_dispatch:false,website_write:false,
  tenant_id:context.tenantId,site_id:context.siteId,crawl_id:context.crawlId,page_snapshot_id:context.pageSnapshotId,invocation_id:context.invocationId,receipt_evidence_id:input.receiptEvidenceId,
  source:{evidence_id:prepared.source.evidenceId,sha256:prepared.source.rawSha256,bytes:prepared.source.rawBytes,content_type:prepared.source.contentType},
  preparation:{version:prepared.transformationVersion,decoder_version:prepared.decoderVersion,encoding:prepared.encoding,input_sha256:prepared.inputSha256,input_bytes:prepared.inputBytes,url:prepared.url},
  invocation:{started_at:context.startedAt,finished_at:context.finishedAt,expected_browser_build:context.browserBuild},
  transport:{sha256:hash(stdout),bytes:stdout.byteLength,retained:false},
  worker:{...result,error:result.error??null,samples:result.samples.map(({dom,...sample},index)=>({...sample,evidence_id:domArtifacts[index]!.evidenceId,sha256:domArtifacts[index]!.sha256,bytes:domArtifacts[index]!.bytes.byteLength}))},
 };
 validate(base+'offline-render-manifest.schema.json',manifest);
 const manifestBytes=Buffer.from(canonical(manifest));
 if(manifestBytes.byteLength>5242880)throw new Error('response_too_large');
 return {manifest,manifestBytes,domArtifacts};
}
