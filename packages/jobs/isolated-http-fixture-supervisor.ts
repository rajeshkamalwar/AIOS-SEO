import { randomUUID } from 'node:crypto';
import { hash, manifestHash } from '../contracts/index.js';
import { normalizeUrl } from '../perception/url.js';
import { runHttpFixtureBroker } from '../perception/http-fixture-broker.js';
import { parseHttpFixtureResult, type HttpFixtureEngine, type HttpFixtureMetadata, type HttpFixtureRunResult } from './docker-http-fixture.js';
import { HttpLane, type HttpReservation } from './http-lane.js';
import { HttpSupervisor, type HttpInvocationBinding } from './http-supervisor.js';
import type { HttpFixtureInput } from './http-fixture-supervisor.js';
import type { Lease } from './index.js';

export interface IsolatedHttpFixtureResult {
 state:'completed'|'failed'|'aborted'|'timeout'; reservation:HttpReservation;
 terminalReceiptId:string; containerId:string; result:HttpFixtureMetadata|null;
}
/** Local fixture-only collection. The worker owns no sockets or credentials;
 * the trusted broker owns one fixed hop. Neither output nor a timeout proves
 * resource termination. Independent container AND broker cleanup is required. */
export class IsolatedHttpFixtureSupervisor {
 constructor(private lane:HttpLane,private supervisor:HttpSupervisor,private engine:HttpFixtureEngine){}
 async collect(lease:Lease,input:HttpFixtureInput,options:{signal?:AbortSignal;wallTimeoutMs?:number}={}):Promise<IsolatedHttpFixtureResult>{
  const timeoutMs=input.timeoutMs??20000,wall=options.wallTimeoutMs??25000;
  if(Object.keys(input).some(k=>!['url','fixturePort','maxDecodedBytes','timeoutMs'].includes(k))||Object.keys(options).some(k=>!['signal','wallTimeoutMs'].includes(k))||typeof input.url!=='string'||!Number.isSafeInteger(input.fixturePort)||input.fixturePort<1||input.fixturePort>65535||!Number.isSafeInteger(input.maxDecodedBytes)||input.maxDecodedBytes<1||input.maxDecodedBytes>5242880||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000||!Number.isSafeInteger(wall)||wall<1||wall>25000)throw new Error('invalid_input');
  const normalized=normalizeUrl(input.url),url=new URL(input.url);
  if(normalized.excluded||normalized.url!==input.url||!url.hostname.endsWith('.example')||url.pathname!=='/robots.txt'||url.search)throw new Error('fixture_only');
  if(options.signal?.aborted)throw new Error('aborted');
  // Copy caller-owned values before any await; callbacks cannot change authority.
  const l={...lease},task={url:input.url,fixturePort:input.fixturePort,maxDecodedBytes:input.maxDecodedBytes,timeoutMs};
  const reservation=await this.lane.reserve(l,{origin:url.origin,maxDecodedBytes:task.maxDecodedBytes});
  if(reservation.state!=='reserved')throw new Error('invocation_already_settled');
  const container=await this.engine.create();
  let binding:HttpInvocationBinding|undefined,bound=false,requested=false,protocolViolation=false;
  let broker:Awaited<ReturnType<typeof runHttpFixtureBroker>>|undefined;
  let execution:HttpFixtureRunResult|undefined;
  let failure:unknown;
  const current=async()=>{
   if(options.signal?.aborted)throw new Error('aborted');
   const now=await this.lane.reserve(l,{origin:url.origin,maxDecodedBytes:task.maxDecodedBytes});
   if(now.reservationId!==reservation.reservationId||now.invocationId!==reservation.invocationId||now.state!=='reserved')throw new Error('invocation_fenced');
  };
  try {
   if(!/^[a-f0-9]{64}$/.test(container.id)||!/^[a-f0-9]{64}$/.test(container.imageDigest))throw new Error('invalid_container_identity');
   binding={lease:l,reservationId:reservation.reservationId,invocationId:reservation.invocationId,processInstanceId:randomUUID(),collectorBuildDigest:container.imageDigest,inputContextHash:manifestHash({profile:'isolated-http-fixture-v1',containerId:container.id,task}),startedAt:new Date().toISOString()};
   await this.supervisor.bindInvocation(binding);bound=true;
   execution=await this.engine.start(container,{timeoutMs:wall,...(options.signal?{signal:options.signal}:{}),beforeStart:current,onRequest:async signal=>{
    if(requested){protocolViolation=true;throw new Error('duplicate_broker_request');}
    requested=true;
    broker=await runHttpFixtureBroker(task,{signal,beforeRequest:current});
    if(!broker.result)throw new Error('fixture_transport_failed');
    return broker.result;
   }});
  }catch(error){failure=error;}
  // This is a trusted Docker inspect/remove/absence witness, not CLI close.
  // Any uncertain cleanup throws before a receipt can release accounting.
  const cleanup=await this.engine.cleanup(container);
  if(!bound||!binding)throw failure??new Error('invocation_not_bound');
  if(requested&&!broker)throw new Error('broker_termination_unverified');
  const stdout=execution?.stdout??Buffer.alloc(0);
  const parsed=execution?parseHttpFixtureResult(stdout,task.maxDecodedBytes):null;
  const valid=!failure&&!protocolViolation&&execution?.state==='exited'&&cleanup.exitCode===0&&broker?.result&&parsed&&manifestHash(parsed)===manifestHash(broker.result);
  const finishedAt=broker&&broker.closedAt>cleanup.finishedAt?broker.closedAt:cleanup.finishedAt;
  const terminalReceiptId=await this.supervisor.recordTerminalReceipt({...binding,finishedAt,termination:cleanup.termination,resultDigest:manifestHash({profile:'isolated-http-fixture-v1',containerId:container.id,stdoutSha256:hash(stdout),state:execution?.state??'failed',exitCode:cleanup.exitCode,brokerClosedAt:broker?.closedAt??null,brokerResult:broker?.result??null,protocolViolation}),actualDecodedBytes:null});
  await this.lane.settle(l,reservation.reservationId,terminalReceiptId);
  return {state:options.signal?.aborted?'aborted':execution?.state==='timeout'?'timeout':valid?'completed':'failed',reservation,terminalReceiptId,containerId:container.id,result:valid?parsed:null};
 }
}
