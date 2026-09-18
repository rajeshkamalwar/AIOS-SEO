import type {ClientRequest} from 'node:http';
import type {Socket} from 'node:net';
import {hash} from '../contracts/index.js';
import type {HttpFixtureResult} from '../persistence/index.js';
import {requestPinnedObserved,safeHeaders,type Response} from './transport.js';
import type {HttpFixtureBrokerReceipt,HttpFixturePrivateCapture} from './http-fixture-broker.js';
/** Trusted internal socket lifecycle implementation. Entry adapters validate the fixed local task before calling. */
export async function runFixtureBrokerTransport(input:{url:string;fixturePort:number;maxDecodedBytes:number;timeoutMs:number},options:{signal?:AbortSignal;beforeRequest:()=>Promise<void>}):Promise<{receipt:HttpFixtureBrokerReceipt;capture:HttpFixturePrivateCapture}>{
 const {fixturePort,maxDecodedBytes,timeoutMs,url}=input,logical=new URL(url),signal=options.signal;
 const physicalUrl=new URL(`http://127.0.0.1:${fixturePort}${logical.pathname}`);
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
  response=await requestPinnedObserved(physicalUrl,{address:'127.0.0.1',family:4},{maxBytes:maxDecodedBytes,timeoutMs},observe);
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
