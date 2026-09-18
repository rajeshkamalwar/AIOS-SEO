import type {ClientRequest} from 'node:http';
import type {Socket} from 'node:net';
import {hash} from '../contracts/index.js';
import {normalizeUrl} from './url.js';
import {requestPinnedObserved,type Response} from './transport.js';
export interface HttpFixtureBrokerInput {url:string;fixturePort:number;maxDecodedBytes:number;timeoutMs?:number}
export interface HttpFixtureBrokerReceipt {
 result:{status:number;truncated:boolean;retainedBodyBytes:number;retainedBodySha256:string|null}|null;
 error:string|null;closedAt:string;
}
/** One host-owned local fixture request, never a worker-selected destination or
 * production transport. Returns no response body/headers; closure is measured
 * from Node request/socket events, never inferred from destroy() or a timer. */
export async function runHttpFixtureBroker(input:HttpFixtureBrokerInput,options:{signal?:AbortSignal;beforeRequest:()=>Promise<void>}):Promise<HttpFixtureBrokerReceipt>{
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
 let response:Response|null=null,error:string|null=null;
 try{
  response=await requestPinnedObserved(new URL(`http://127.0.0.1:${fixturePort}/robots.txt`),{address:'127.0.0.1',family:4},{maxBytes:maxDecodedBytes,timeoutMs},observe);
 }catch(cause){
  const code=cause instanceof Error?cause.message:'';
  error=signal?.aborted?'aborted':['collector_timeout','collector_header_timeout','collector_connect_timeout','collector_interrupted','content_encoding_unsupported'].includes(code)?code:'transport_failed';
 }finally{signal?.removeEventListener('abort',abort);}
 if(!request)throw new Error('egress_termination_unverified');
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([closed,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('egress_termination_unverified')),5000);})]);}finally{clearTimeout(timer);}
 if(!lastClose)throw new Error('egress_termination_unverified');
 return {result:response?{status:response.status,truncated:response.truncated,retainedBodyBytes:response.body?.byteLength??0,retainedBodySha256:response.body===null?null:hash(response.body)}:null,error,closedAt:lastClose};
}
