import {MIMEType} from 'node:util';
import {hash,uuid} from '../contracts/index.js';
import {decodeDocument} from './decoding.js';
import {normalizeUrl} from './url.js';

export interface RawReplayEvidence {
 evidenceId:string;sha256:string;bytes:number;sourceUri:string;truncated:boolean;
 /** Full retained response Content-Type including charset, NOT only Evidence.mime_type essence. */
 contentType:string;
}
export type PreparedOfflineRenderInput=
 | {state:'prepared';profile:'local-offline-replay-v2';url:string;html:string;inputSha256:string;inputBytes:number;
    source:{evidenceId:string;rawSha256:string;rawBytes:number;contentType:string};encoding:string;
    decoderVersion:'html-sniff-6/node24-v1';transformationVersion:'html-decoded-to-utf8-v1'}
 | {state:'not_prepared';reason:'raw_budget'|'input_budget'|'truncated'|'unsupported_mime'|'decoding_failed'};

/** Pure local fixture preparation from a caller-authorized retained artifact.
 * Verifies supplied integrity metadata but does not authenticate its origin,
 * create evidence, grant dispatch, or equate replay bytes with raw HTTP bytes.
 */
export function prepareOfflineRenderInput(bytes:Uint8Array,evidence:RawReplayEvidence):PreparedOfflineRenderInput {
 try {
  if(!(bytes instanceof Uint8Array)||!evidence||typeof evidence!=='object'||Array.isArray(evidence))throw new Error();
  const fields=['evidenceId','sha256','bytes','sourceUri','truncated','contentType'];
  if(Object.keys(evidence).length!==fields.length||fields.some(k=>!Object.hasOwn(evidence,k)))throw new Error();
  uuid(evidence.evidenceId);
  if(typeof evidence.sha256!=='string'||!/^[a-f0-9]{64}$/.test(evidence.sha256)||!Number.isSafeInteger(evidence.bytes)||evidence.bytes<0||typeof evidence.truncated!=='boolean'||typeof evidence.contentType!=='string'||evidence.contentType.length<1||evidence.contentType.length>4096||typeof evidence.sourceUri!=='string')throw new Error();
  const normalized=normalizeUrl(evidence.sourceUri),url=new URL(normalized.url);
  if(normalized.excluded||url.protocol!=='https:'||!url.hostname.endsWith('.example')||url.href!==evidence.sourceUri)throw new Error();
 }catch {throw new Error('schema_invalid');}
 if(bytes.byteLength!==evidence.bytes)throw new Error('artifact_integrity_failed');
 if(bytes.byteLength>5242880)return {state:'not_prepared',reason:'raw_budget'};
 // Snapshot caller bytes once so hashing and decoding consume the same content.
 const raw=Buffer.from(bytes);
 if(hash(raw)!==evidence.sha256)throw new Error('artifact_integrity_failed');
 if(evidence.truncated)return {state:'not_prepared',reason:'truncated'};
 let mime:MIMEType;
 try {mime=new MIMEType(evidence.contentType);}catch {return {state:'not_prepared',reason:'decoding_failed'};}
 if(mime.essence!=='text/html')return {state:'not_prepared',reason:'unsupported_mime'};
 const decoded=decodeDocument(raw,evidence.contentType);
 if(decoded.state!=='decoded')return {state:'not_prepared',reason:'decoding_failed'};
 const input=Buffer.from(decoded.text,'utf8');
 if(input.toString('utf8')!==decoded.text)return {state:'not_prepared',reason:'decoding_failed'};
 if(input.byteLength>5242880)return {state:'not_prepared',reason:'input_budget'};
 return {state:'prepared',profile:'local-offline-replay-v2',url:evidence.sourceUri,html:decoded.text,inputSha256:hash(input),inputBytes:input.byteLength,
  source:{evidenceId:evidence.evidenceId,rawSha256:evidence.sha256,rawBytes:evidence.bytes,contentType:evidence.contentType},
  encoding:decoded.encoding,decoderVersion:decoded.decoderVersion,transformationVersion:'html-decoded-to-utf8-v1'};
}
