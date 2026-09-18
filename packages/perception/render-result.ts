import {normalizeUrl} from './url.js';

export interface OfflineRenderResult {
 profile:'local-offline-replay-v1'; url:string|null; browserBuild:string|null;
 state:'captured'|'policy_limited'|'failed'|'timeout';
 samples:{offsetMs:0|2000|5000;actualOffsetMs:number;dom:string}[];
 deniedCount:number;deniedRequests:{url:string;method:string;resourceType:string;reason:'offline_policy'|'context_changed'}[];
 sandbox:{namespace:true;pid:true;network:true;seccomp:true}|null;
 error?:'render_failed'|'timeout'|'attempt_budget_exhausted';
}
const invalid=():never=>{throw new Error('render_result_invalid');};
function object(value:unknown,required:string[],optional:string[]=[]):asserts value is Record<string,any>{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const keys=Object.keys(value);
 if(required.some(key=>!keys.includes(key))||keys.some(key=>!required.includes(key)&&!optional.includes(key)))invalid();
}
const bounded=(value:unknown,max=4096):value is string=>typeof value==='string'&&value.length>0&&value.length<=max;
const resourceTypes=new Set(['document','stylesheet','image','media','font','script','texttrack','xhr','fetch','eventsource','websocket','manifest','other','ping','popup','download','navigation']);

/** Pure untrusted-receipt validation, not authentication, evidence acceptance or
 * dispatch authority. The supervisor must independently establish worker/image
 * identity and OS isolation. No Evidence ID or invented sample is created here.
 * Expected build is pinned by the caller's trusted deployment context.
 */
export function parseOfflineRenderResult(bytes:Uint8Array,expected:{url:string;browserBuild:string}):OfflineRenderResult {
 try {
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>20*1024*1024||!bounded(expected.browserBuild))invalid();
  const normalized=normalizeUrl(expected.url),url=new URL(normalized.url);
  if(normalized.excluded||url.protocol!=='https:'||!url.hostname.endsWith('.example')||url.href!==expected.url)invalid();
  const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  object(value,['profile','url','browserBuild','state','samples','deniedCount','deniedRequests','sandbox'],['error']);
  if(value.profile!=='local-offline-replay-v1'||!['captured','policy_limited','failed','timeout'].includes(value.state))invalid();
  if(value.url!==null&&value.url!==expected.url)invalid();
  if(value.browserBuild!==null&&value.browserBuild!==expected.browserBuild)invalid();
  if(value.sandbox!==null){object(value.sandbox,['namespace','pid','network','seccomp']);if(Object.values(value.sandbox).some(v=>v!==true))invalid();}
  if(!Array.isArray(value.samples)||value.samples.length>3||!Array.isArray(value.deniedRequests)||!Number.isSafeInteger(value.deniedCount)||value.deniedCount<0||value.deniedCount>99||value.deniedCount!==value.deniedRequests.length)invalid();
  let previous=-1;
  for(const [index,sample] of value.samples.entries()){
   object(sample,['offsetMs','actualOffsetMs','dom']);
   if(sample.offsetMs!==[0,2000,5000][index]||!Number.isSafeInteger(sample.actualOffsetMs)||sample.actualOffsetMs<sample.offsetMs||sample.actualOffsetMs<previous||sample.actualOffsetMs>20000||typeof sample.dom!=='string'||sample.dom.length===0||Buffer.byteLength(sample.dom)>5*1024*1024)invalid();
   // Escaped lone surrogates are legal JSON but not exact UTF-8 DOM artifacts.
   if(Buffer.from(sample.dom,'utf8').toString('utf8')!==sample.dom)invalid();
   previous=sample.actualOffsetMs;
  }
  if(value.samples.length>0&&(value.url===null||value.browserBuild===null||value.sandbox===null))invalid();
  for(const denied of value.deniedRequests){
   object(denied,['url','method','resourceType','reason']);
   // Denied URLs deliberately may be private, non-HTTP, or action-like: they are
   // observations of blocked attempts, never inputs to admission or dispatch.
   if(!bounded(denied.url)||!bounded(denied.method,64)||!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(denied.method)||!resourceTypes.has(denied.resourceType)||!['offline_policy','context_changed'].includes(denied.reason))invalid();
  }
  if(value.state==='captured'&&(value.samples.length!==3||value.deniedCount!==0||value.error!==undefined))invalid();
  if(value.state==='failed'&&value.error!=='render_failed')invalid();
  if(value.state==='timeout'&&value.error!=='timeout')invalid();
  if(value.state==='policy_limited'&&(value.url===null||value.browserBuild===null||value.sandbox===null||(value.error!==undefined&&value.error!=='attempt_budget_exhausted')))invalid();
  if(value.error==='attempt_budget_exhausted'&&(value.state!=='policy_limited'||value.deniedCount!==99))invalid();
  if(value.url===null&&(value.samples.length!==0||value.deniedCount!==0||value.browserBuild!==null||value.sandbox!==null))invalid();
  if(value.browserBuild===null&&value.sandbox!==null)invalid();
  return value as unknown as OfflineRenderResult;
 }catch {return invalid();}
}
