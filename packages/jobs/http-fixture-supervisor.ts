import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { hash,manifestHash } from '../contracts/index.js';
import { normalizeUrl } from '../perception/url.js';
import { HttpLane,type HttpReservation } from './http-lane.js';
import { HttpSupervisor,type HttpInvocationBinding } from './http-supervisor.js';
import type { Lease } from './index.js';
export interface HttpFixtureInput {url:string;fixturePort:number;maxDecodedBytes:number;timeoutMs?:number}
export interface HttpFixtureResult {
 state:'completed'|'failed'|'aborted'|'timeout';reservation:HttpReservation;terminalReceiptId:string;processId:number;
 result:{status:number;truncated:boolean;retainedBodyBytes:number;retainedBodySha256:string|null}|null;
}
const require=createRequire(import.meta.url);
/** Local /robots.txt fixture producer only. Loopback port is trusted test wiring,
 * never customer input. wallTimeoutMs bounds the child lifecycle; preceding DB
 * admission uses its own transaction timeout. No accepted Evidence, public
 * dispatch or sandbox claim. */
export class HttpFixtureSupervisor {
 constructor(private lane:HttpLane,private supervisor:HttpSupervisor){}
 async collect(lease:Lease,input:HttpFixtureInput,options:{signal?:AbortSignal;wallTimeoutMs?:number}={}):Promise<HttpFixtureResult>{
  const timeoutMs=input.timeoutMs??20000,wall=options.wallTimeoutMs??25000;
  if(Object.keys(input).some(k=>!['url','fixturePort','maxDecodedBytes','timeoutMs'].includes(k))||Object.keys(options).some(k=>!['signal','wallTimeoutMs'].includes(k))||typeof input.url!=='string'||!Number.isSafeInteger(input.fixturePort)||input.fixturePort<1||input.fixturePort>65535||!Number.isSafeInteger(input.maxDecodedBytes)||input.maxDecodedBytes<1||input.maxDecodedBytes>5242880||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000||!Number.isSafeInteger(wall)||wall<1||wall>25000)throw new Error('invalid_input');
  const normalized=normalizeUrl(input.url),url=new URL(input.url);
  if(normalized.excluded||normalized.url!==input.url||!url.hostname.endsWith('.example')||url.pathname!=='/robots.txt'||url.search)throw new Error('fixture_only');
  if(options.signal?.aborted)throw new Error('aborted');
  const task={url:input.url,fixturePort:input.fixturePort,maxDecodedBytes:input.maxDecodedBytes,timeoutMs};
  const typescript=import.meta.url.endsWith('.ts'),extension=typescript?'ts':'js';
  const worker=new URL(`../perception/http-fixture-worker.${extension}`,import.meta.url);
  const components=['http-fixture-worker','collector','transport','url','address','dns'];
  const builds=await Promise.all(components.map(async name=>({name,sha256:hash(await readFile(new URL(`../perception/${name}.${extension}`,import.meta.url)))})));
  // This identifies trusted local filesystem bytes; it is not an immutable image attestation.
  const build=manifestHash({profile:'local-http-fixture-v1',node:process.version,components:builds});
  const reservation=await this.lane.reserve(lease,{origin:url.origin,maxDecodedBytes:input.maxDecodedBytes});
  if(reservation.state!=='reserved')throw new Error('invocation_already_settled');
  const args=['--max-old-space-size=64',...(typescript?['--import',require.resolve('tsx')]:[]),fileURLToPath(worker)];
  const workerStarted=performance.now();
  const child=spawn(process.execPath,args,{env:{},stdio:['pipe','pipe','pipe'],windowsHide:true});
  let stdout=Buffer.alloc(0),stderrBytes=0,closed=false,ready=false,spawned=false,exited=false,stopReason:'aborted'|'timeout'|'failed'|null=null;
  let readyResolve:()=>void=()=>{};
  const readyPromise=new Promise<void>(resolve=>{readyResolve=resolve;});
  let cleanupTimer:ReturnType<typeof setTimeout>|undefined;
  let closeResolve:(value:{code:number|null;signal:NodeJS.Signals|null;closedAt:string}|null)=>void=()=>{};
  const stop=(reason:'aborted'|'timeout'|'failed')=>{
   stopReason??=reason;
   if(!closed){
    child.kill('SIGKILL');
    cleanupTimer??=setTimeout(()=>{
     // Inability to confirm termination is not a terminal witness. Leave the
     // durable slot charged, and stop waiting without retaining host pipes.
     child.unref();child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();clearTimeout(timer);options.signal?.removeEventListener('abort',abort);readyResolve();closeResolve(null);
    },5000);
   }
  };
  const abort=()=>stop('aborted');options.signal?.addEventListener('abort',abort,{once:true});
  if(options.signal?.aborted)abort();
  const timer=setTimeout(()=>stop('timeout'),wall);
  child.once('spawn',()=>{spawned=true;});
  child.once('exit',()=>{exited=true;});
  child.stdout.on('data',(chunk:Buffer)=>{
   if(stdout.length+chunk.length>65536){stop('failed');return;}
   stdout=Buffer.concat([stdout,chunk]);
   if(!ready&&stdout.subarray(0,6).toString()==='READY\n'){ready=true;readyResolve();}
  });
  child.stderr.on('data',(chunk:Buffer)=>{stderrBytes+=chunk.length;if(stderrBytes>65536)stop('failed');});
  child.stdin.on('error',()=>stop('failed'));
  child.on('error',()=>stop('failed'));
  const closePromise=new Promise<{code:number|null;signal:NodeJS.Signals|null;closedAt:string}|null>(resolve=>{
   closeResolve=resolve;
   // 'close' follows exit AND closure of all stdio streams. No timer or worker
   // message is accepted as termination; a missing close never creates a witness.
   child.once('close',(code,signal)=>{closed=true;clearTimeout(timer);clearTimeout(cleanupTimer);options.signal?.removeEventListener('abort',abort);readyResolve();resolve({code,signal,closedAt:new Date().toISOString()});});
  });
  let binding:HttpInvocationBinding|undefined,bound=false,preflightError:unknown;
  try {
   await readyPromise;
   if(performance.now()-workerStarted>=wall)stop('timeout');
   if(!ready||closed||stopReason)throw new Error('worker_start_failed');
   binding={lease,reservationId:reservation.reservationId,invocationId:reservation.invocationId,processInstanceId:randomUUID(),collectorBuildDigest:build,inputContextHash:manifestHash({profile:'local-http-fixture-v1',task}),startedAt:new Date().toISOString()};
   await this.supervisor.bindInvocation(binding);bound=true;
   // Commit-time admission gates are rechecked just before this one fixture GO.
   const live=await this.lane.reserve(lease,{origin:url.origin,maxDecodedBytes:input.maxDecodedBytes});
   if(performance.now()-workerStarted>=wall)stop('timeout');
   if(live.reservationId!==reservation.reservationId||live.invocationId!==reservation.invocationId||live.state!=='reserved'||closed||stopReason)throw new Error('invocation_fenced');
   child.stdin.end(JSON.stringify(task));
  }catch(error){preflightError=error;stop('failed');}
  const exit=await closePromise;
  if(!exit||!binding||!bound||!spawned||!exited){
   // A successful bind is needed before a process can own this reservation.
   // Failed binding/spawn remains conservative; no speculative receipt.
   throw preflightError??new Error('worker_start_failed');
  }
  let result:HttpFixtureResult['result']=null;
  try{
   const lines=stdout.toString('utf8').split('\n');
   if(!preflightError&&lines.length===3&&lines[0]==='READY'&&lines[2]===''){
    const v=JSON.parse(lines[1]!);
    if(Object.keys(v).sort().join(',')==='kind,retainedBodyBytes,retainedBodySha256,status,truncated'&&v.kind==='result'&&Number.isInteger(v.status)&&v.status>=100&&v.status<=599&&typeof v.truncated==='boolean'&&Number.isSafeInteger(v.retainedBodyBytes)&&v.retainedBodyBytes>=0&&v.retainedBodyBytes<=input.maxDecodedBytes&&(v.retainedBodySha256===null||/^[a-f0-9]{64}$/.test(v.retainedBodySha256)))result={status:v.status,truncated:v.truncated,retainedBodyBytes:v.retainedBodyBytes,retainedBodySha256:v.retainedBodySha256};
   }
  }catch{/* Closed malformed output is a failure, never accepted evidence. */}
  const terminalReceiptId=await this.supervisor.recordTerminalReceipt({...binding,finishedAt:exit.closedAt,termination:exit.signal?'killed':'exited',resultDigest:manifestHash({stdoutSha256:hash(stdout),stderrBytes,code:exit.code,signal:exit.signal}),actualDecodedBytes:null});
  await this.lane.settle(lease,reservation.reservationId,terminalReceiptId);
  return {state:stopReason??(exit.code===0&&result?'completed':'failed'),reservation,terminalReceiptId,processId:child.pid!,result};
 }
}
