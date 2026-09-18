import {normalizeUrl} from './url.js';

export interface OfflineRenderResult {
 profile:'local-offline-replay-v3'; url:string|null; inputSha256:string|null; browserBuild:string|null;
 state:'captured'|'policy_limited'|'failed'|'timeout';
 samples:{offsetMs:0|2000|5000;actualOffsetMs:number;observedAt:string;pendingRequests:number;dom:string}[];
 deniedCount:number;deniedRequests:{url:string;method:string;resourceType:string;reason:'offline_policy'|'context_changed';observedAt:string}[];
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
function timestamp(value:unknown):number {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return invalid();
 const time=Date.parse(value);if(!Number.isFinite(time)||new Date(time).toISOString()!==value)return invalid();return time;
}

/** Pure untrusted-receipt validation, not authentication, evidence acceptance or
 * dispatch authority. The supervisor must independently establish worker/image
 * identity and OS isolation. No Evidence ID or invented sample is created here.
 * V3 requires measured sample/denial times and pending HTTP request counts.
 * V1/V2 receipts are rejected; measurements are never backfilled.
 * Expected build, input digest and invocation bounds come from the trusted host.
 */
export function parseOfflineRenderResult(bytes:Uint8Array,expected:{url:string;browserBuild:string;inputSha256:string;startedAt:string;finishedAt:string}):OfflineRenderResult {
 try {
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>20*1024*1024||!bounded(expected.browserBuild)||typeof expected.inputSha256!=='string'||!/^[a-f0-9]{64}$/.test(expected.inputSha256))invalid();
  const started=timestamp(expected.startedAt),finished=timestamp(expected.finishedAt);
  if(finished<started)invalid();
  const observed=(value:unknown)=>{const time=timestamp(value);if(time<started||time>finished)invalid();return time;};
  const normalized=normalizeUrl(expected.url),url=new URL(normalized.url);
  if(normalized.excluded||url.protocol!=='https:'||!url.hostname.endsWith('.example')||url.href!==expected.url)invalid();
  const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  object(value,['profile','url','inputSha256','browserBuild','state','samples','deniedCount','deniedRequests','sandbox'],['error']);
  if(value.profile!=='local-offline-replay-v3'||!['captured','policy_limited','failed','timeout'].includes(value.state))invalid();
  if(value.url!==null&&value.url!==expected.url)invalid();
  if(value.url===null?value.inputSha256!==null:value.inputSha256!==expected.inputSha256)invalid();
  if(value.browserBuild!==null&&value.browserBuild!==expected.browserBuild)invalid();
  if(value.sandbox!==null){object(value.sandbox,['namespace','pid','network','seccomp']);if(Object.values(value.sandbox).some(v=>v!==true))invalid();}
  if(!Array.isArray(value.samples)||value.samples.length>3||!Array.isArray(value.deniedRequests)||!Number.isSafeInteger(value.deniedCount)||value.deniedCount<0||value.deniedCount>99||value.deniedCount!==value.deniedRequests.length)invalid();
  let previous=-1,previousObserved=started;
  for(const [index,sample] of value.samples.entries()){
   object(sample,['offsetMs','actualOffsetMs','observedAt','pendingRequests','dom']);
   const time=observed(sample.observedAt);if(time<previousObserved||!Number.isSafeInteger(sample.pendingRequests)||sample.pendingRequests<0||sample.pendingRequests>100)invalid();
   previousObserved=time;
   if(sample.offsetMs!==[0,2000,5000][index]||!Number.isSafeInteger(sample.actualOffsetMs)||sample.actualOffsetMs<sample.offsetMs||sample.actualOffsetMs<previous||sample.actualOffsetMs>20000||typeof sample.dom!=='string'||sample.dom.length===0||Buffer.byteLength(sample.dom)>5*1024*1024)invalid();
   // Escaped lone surrogates are legal JSON but not exact UTF-8 DOM artifacts.
   if(Buffer.from(sample.dom,'utf8').toString('utf8')!==sample.dom)invalid();
   previous=sample.actualOffsetMs;
  }
  if(value.samples.length>0&&(value.url===null||value.browserBuild===null||value.sandbox===null))invalid();
  let previousDenied=started;
  for(const denied of value.deniedRequests){
   object(denied,['url','method','resourceType','reason','observedAt']);
   const time=observed(denied.observedAt);if(time<previousDenied)invalid();previousDenied=time;
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
