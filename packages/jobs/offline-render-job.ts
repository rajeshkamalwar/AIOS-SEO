import type {PoolClient} from 'pg';
import {manifestHash} from '../contracts/index.js';
import type {PreparedOfflineRenderInput} from '../perception/render-input.js';
import type {OfflineRenderPreparation} from './offline-render-source.js';
export type ReadyOfflineRenderInput=Extract<PreparedOfflineRenderInput,{state:'prepared'}>;
export interface OfflineRenderJobDescriptor {
 version:1;handler:'offline_render_v1';policy:'discovery-v1';parentJobId:string;parentAttemptId:string;parentAttempt:number;
 tenantId:string;siteId:string;crawlId:string;pageSnapshotId:string;pageId:string;observationId:string;rawEvidenceId:string;receiptEvidenceId:string;bundleId:string;knownSeq:number;
 url:string;profile:'local-offline-replay-v3';rawSha256:string;rawBytes:number;inputSha256:string;inputBytes:number;contentType:string;encoding:string;decoderVersion:string;transformationVersion:string;sourceContextHash:string;
}
export function renderDescriptor(result:OfflineRenderPreparation,p:ReadyOfflineRenderInput,context:string,parent:{jobId:string;attemptId:string;attempt:number}):OfflineRenderJobDescriptor {
 return {version:1,handler:'offline_render_v1',policy:'discovery-v1',parentJobId:parent.jobId,parentAttemptId:parent.attemptId,parentAttempt:parent.attempt,...result.source,url:p.url,profile:p.profile,rawSha256:p.source.rawSha256,rawBytes:p.source.rawBytes,inputSha256:p.inputSha256,inputBytes:p.inputBytes,contentType:p.source.contentType,encoding:p.encoding,decoderVersion:p.decoderVersion,transformationVersion:p.transformationVersion,sourceContextHash:context};
}
export async function readRenderDescriptor(c:PoolClient,j:any):Promise<OfflineRenderJobDescriptor>{
 const row=(await c.query('SELECT descriptor FROM offline_render_job WHERE tenant_id=$1 AND job_id=$2',[j.tenant_id,j.job_id])).rows[0];
 if(!row||manifestHash({descriptor:row.descriptor,release:j.release_digest,kind:'render',policy:'discovery-v1'})!==j.expected_input_hash)throw new Error('source_context_changed');
 return row.descriptor;
}
