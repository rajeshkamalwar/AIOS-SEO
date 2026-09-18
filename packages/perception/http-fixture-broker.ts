import type {ClientRequest} from 'node:http';
import type {Socket} from 'node:net';
import {hash} from '../contracts/index.js';
import type {HttpFixtureResult} from '../persistence/index.js';
import {normalizeUrl} from './url.js';
import {requestPinnedObserved,safeHeaders,type Response} from './transport.js';
export interface HttpFixtureBrokerInput {url:string;fixturePort:number;maxDecodedBytes:number;timeoutMs?:number}
export interface HttpFixtureBrokerReceipt {
 result:{status:number;truncated:boolean;retainedBodyBytes:number;retainedBodySha256:string|null}|null;
 error:string|null;closedAt:string;
}
export interface HttpFixturePrivateCapture {observedAt:string;result:HttpFixtureResult;body:Buffer|null}
/** One host-owned local fixture request, never a worker-selected destination or
 * production transport. Returns no response body/headers; closure is measured
 * from Node request/socket events, never inferred from destroy() or a timer. */
export async function runHttpFixtureBroker(input:HttpFixtureBrokerInput,options:{signal?:AbortSignal;beforeRequest:()=>Promise<void>}):Promise<HttpFixtureBrokerReceipt>{
 return (await runHttpFixtureBrokerCaptured(input,options)).receipt;
}
/** Internal trusted host handoff only. Never send capture to the worker, queue,
 * public operational result or caller-selected callback. Physical transport is
 * fixed loopback; the receipt URL is the synthetic logical scope, not live proof. */
export async function runHttpFixtureBrokerCaptured(input:HttpFixtureBrokerInput,options:{signal?:AbortSignal;beforeRequest:()=>Promise<void>}):Promise<{receipt:HttpFixtureBrokerReceipt;capture:HttpFixturePrivateCapture}>{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['url','fixturePort','maxDecodedBytes','timeoutMs'].includes(k))||typeof input.url!=='string'||!Number.isSafeInteger(input.fixturePort)||input.fixturePort<1||input.fixturePort>65535||!Number.isSafeInteger(input.maxDecodedBytes)||input.maxDecodedBytes<1||input.maxDecodedBytes>5242880||!Number.isSafeInteger(input.timeoutMs??20000)||(input.timeoutMs??20000)<1||(input.timeoutMs??20000)>20000||!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['signal','beforeRequest'].includes(k))||typeof options.beforeRequest!=='function')throw new Error('invalid_input');
 const normalized=normalizeUrl(input.url),logical=new URL(input.url);
 if(normalized.excluded||normalized.url!==input.url||!logical.hostname.endsWith('.example')||!['http:','https:'].includes(logical.protocol)||logical.pathname!=='/robots.txt'||logical.search)throw new Error('fixture_only');
 const fixturePort=input.fixturePort,maxDecodedBytes=input.maxDecodedBytes,timeoutMs=input.timeoutMs??20000,signal=options.signal;
 if(signal?.aborted)throw new Error('aborted');
 await options.beforeRequest();
 if(signal?.aborted)throw new Error('aborted');
 let request:ClientRequest|undefined,requestClosed=false,lastClose:string|null=null;
 const sockets=new Set<Socket>();let resolveClosed:()=>void=()=>{};
 const closed=new Promise<void>(resolve=>{resolveClosed=resolve;});
 const check=()=>{if(requestClosed&&sockets.size===0&&lastClose!==null)resolveClosed();};
 const observe=(owned:ClientRequest)=>{
  request=owned;
  owned.on('socket',socket=>{sockets.add(socket);socket.once('close',()=>{sockets.delete(socket);lastClose=new Date().toISOString();check();});});
  owned.once('close',()=>{requestClosed=true;lastClose=new Date().toISOString();check();});
 };
 const abort=()=>request?.destroy(new Error('broker_aborted'));
 signal?.addEventListener('abort',abort,{once:true});
 let response:Response|null=null,error:string|null=null,observedAt:string;
 try{
  response=await requestPinnedObserved(new URL(`http://127.0.0.1:${fixturePort}/robots.txt`),{address:'127.0.0.1',family:4},{maxBytes:maxDecodedBytes,timeoutMs},observe);
 }catch(cause){
  const code=cause instanceof Error?cause.message:'';
  error=signal?.aborted?'aborted':['collector_timeout','collector_header_timeout','collector_connect_timeout','collector_interrupted','content_encoding_unsupported'].includes(code)?code:'transport_failed';
 }finally{observedAt=new Date().toISOString();signal?.removeEventListener('abort',abort);}
 if(!request)throw new Error('egress_termination_unverified');
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([closed,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('egress_termination_unverified')),5000);})]);}finally{clearTimeout(timer);}
 if(!lastClose)throw new Error('egress_termination_unverified');
 const body=response?.body===undefined||response.body===null?null:Buffer.from(response.body);
 const transportError:HttpFixtureResult['error']=response?null:error==='aborted'?{code:'cancelled',retryable:false,detail:'fixture aborted',evidence_ids:[]}:error==='content_encoding_unsupported'?{code:'parse_failed',retryable:false,detail:'fixture content encoding unsupported',evidence_ids:[]}:error?.includes('timeout')?{code:'timeout',retryable:true,detail:'fixture timeout',evidence_ids:[]}:{code:'source_unavailable',retryable:true,detail:'fixture transport failed',evidence_ids:[]};
 const result:HttpFixtureResult={url:logical.href,final_url:logical.href,method:'GET',status_code:response?.status??null,headers:response?Object.entries(safeHeaders(response.headers)).sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>({name,value})):[],truncated:response?.truncated??false,error:transportError};
 return {receipt:{result:response?{status:response.status,truncated:response.truncated,retainedBodyBytes:body?.byteLength??0,retainedBodySha256:body===null?null:hash(body)}:null,error,closedAt:lastClose},capture:{observedAt,result,body}};
}
