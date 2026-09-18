import {base,canonical,hash,validate} from '../contracts/index.js';
import {buildOfflineRenderManifest,type OfflineRenderManifestInput} from './render-manifest.js';
import {projectRenderDomPrivacyIsolated} from './render-privacy-isolated.js';

/** Local privacy-limited artifact projection, not a complete rendered DOM or
 * collection authority. Original stdout and original DOM are never returned as
 * retained artifacts. Any uncertain projection rejects the entire collection. */
export async function buildRetainedOfflineRenderManifest(input:OfflineRenderManifestInput){
 const raw=buildOfflineRenderManifest(input);
 const domArtifacts:{evidenceId:string;bytes:Buffer;sha256:string}[]=[];
 const samples=[];
 for(const [index,sample] of raw.manifest.worker.samples.entries()){
  const projection=await projectRenderDomPrivacyIsolated(raw.domArtifacts[index]!.bytes.toString('utf8'));
  if(projection.state!=='projected')throw new Error('render_privacy_not_retainable');
  const bytes=Buffer.from(projection.bytes);
  if(hash(bytes)!==projection.sha256||projection.originalSha256!==sample.sha256)throw new Error('artifact_integrity_failed');
  domArtifacts.push({evidenceId:sample.evidence_id,bytes,sha256:projection.sha256});
  samples.push({...sample,sha256:projection.sha256,bytes:bytes.length,original_sha256:sample.sha256,original_retained:false as const});
 }
 const safeUrl=(value:string)=>{const url=new URL(value);url.search='';url.hash='';return url.href;};
 const manifest={...raw.manifest,receipt_type:'offline_render_privacy_projection',schema_version:2,
  redaction_version:'render-privacy-v1',coverage:'privacy_limited',
  limitations:['not_complete_dom','removed_content_cannot_support_absence_or_parity','denied_resource_urls_withheld','queries_and_fragments_withheld','relative_or_query_url_attributes_withheld','arbitrary_secret_detection_not_claimed'],
  source:{...raw.manifest.source,content_type:'text/html'},
  preparation:{...raw.manifest.preparation,url:safeUrl(raw.manifest.preparation.url)},
  worker:{...raw.manifest.worker,url:raw.manifest.worker.url===null?null:safeUrl(raw.manifest.worker.url),samples,
   deniedRequests:raw.manifest.worker.deniedRequests.map(item=>({...item,url:'[withheld]',method:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(item.method.toUpperCase())?item.method.toUpperCase():'OTHER'}))},
 };
 validate(base+'offline-render-retained-manifest.schema.json',manifest);
 const manifestBytes=Buffer.from(canonical(manifest));
 if(manifestBytes.length>5242880)throw new Error('response_too_large');
 return {manifest,manifestBytes,domArtifacts};
}
