import { randomUUID } from 'node:crypto';
import { hash, manifestHash, base, validate, canonical } from '../contracts/index.js';
import { runHttpFixtureBrokerCaptured, type HttpFixturePrivateCapture } from '../perception/http-fixture-broker.js';
import { parseHttpFixtureResult, type HttpFixtureEngine, type HttpFixtureMetadata, type HttpFixtureRunResult, type HttpFixtureContainer, type HttpFixtureCleanup } from './docker-http-fixture.js';
import { HttpLane, type HttpReservation } from './http-lane.js';
import { HttpSupervisor, type HttpInvocationBinding } from './http-supervisor.js';
import { Jobs, type Lease } from './index.js';
import type {HttpBootstrapAcceptanceInput} from './http-bootstrap-acceptance.js';

export interface IsolatedHttpFixtureResult {
 state:'completed'|'failed'|'aborted'|'timeout'; reservation:HttpReservation;
 terminalReceiptId:string; containerId:string; result:HttpFixtureMetadata|null; evidenceAccepted:false;
}
/** Local fixture-only collection. The worker owns no sockets or credentials;
 * the trusted broker owns one fixed hop. Neither output nor a timeout proves
 * resource termination. Independent container AND broker cleanup is required. */
export class IsolatedHttpFixtureSupervisor {
 constructor(private jobs:Jobs,private lane:HttpLane,private supervisor:HttpSupervisor,private engine:HttpFixtureEngine){}
 async collect(lease:Lease,input:{fixturePort:number},options:{signal?:AbortSignal;wallTimeoutMs?:number}={}):Promise<IsolatedHttpFixtureResult>{
  return this.execute(lease,input,options);
 }
 /** Private host-only handoff; no raw body or headers enter the child or return. */
 async collectAndAccept(lease:Lease,input:{fixturePort:number},options:{signal?:AbortSignal;wallTimeoutMs?:number}={}){
  const l={...lease};let acceptance:Awaited<ReturnType<Jobs['acceptHttpBootstrapFixture']>>|undefined;
  const execution=await this.execute(l,input,options,async captured=>{acceptance=await this.jobs.acceptHttpBootstrapFixture(l,captured);});
  if(!acceptance)throw new Error('http_result_not_acceptable');
  return {execution,acceptance};
 }
 /** Complete only this admitted bootstrap job; projection grants no next fetch. */
 async collectAcceptAndProject(lease:Lease,input:{fixturePort:number},options:{signal?:AbortSignal;wallTimeoutMs?:number}={}){
  const l={...lease};
  const accepted=await this.collectAndAccept(l,input,options);
  const projection=await this.jobs.projectHttpBootstrapFixture(l);
  return {...accepted,projection};
 }
 private async execute(lease:Lease,input:{fixturePort:number},options:{signal?:AbortSignal;wallTimeoutMs?:number},accept?:(input:HttpBootstrapAcceptanceInput)=>Promise<void>):Promise<IsolatedHttpFixtureResult>{
  const wall=options.wallTimeoutMs??25000,externalSignal=options.signal;
  if(Object.keys(input).join(',')!=='fixturePort'||Object.keys(options).some(k=>!['signal','wallTimeoutMs'].includes(k))||!Number.isSafeInteger(input.fixturePort)||input.fixturePort<1||input.fixturePort>65535||!Number.isSafeInteger(wall)||wall<1||wall>25000)throw new Error('invalid_input');
  if(externalSignal?.aborted)throw new Error('aborted');
  const l={...lease},fixturePort=input.fixturePort;
  // Only the dedicated governed child can reach reservation/container creation.
  const descriptor=await this.jobs.prepareHttpBootstrapExecution(l);
  const task={url:descriptor.url,fixturePort,maxDecodedBytes:descriptor.maxDecodedBytes,timeoutMs:descriptor.timeoutMs};
  const reservation=await this.lane.reserve(l,{origin:descriptor.origin,maxDecodedBytes:task.maxDecodedBytes});
  if(reservation.state!=='reserved')throw new Error('invocation_already_settled');
  const authority=new AbortController();
  const signal=externalSignal?AbortSignal.any([externalSignal,authority.signal]):authority.signal;
  let pendingHeartbeat:Promise<void>|null=null;
  const heartbeat=setInterval(()=>{
   if(pendingHeartbeat)return;
   pendingHeartbeat=this.jobs.heartbeat(l).catch(()=>{authority.abort();}).finally(()=>{pendingHeartbeat=null;});
  },10000);
  let container:HttpFixtureContainer|undefined,cleanup:HttpFixtureCleanup|undefined;
  let binding:HttpInvocationBinding|undefined,bound=false,requested=false,protocolViolation=false;
  let broker:Awaited<ReturnType<typeof runHttpFixtureBrokerCaptured>>['receipt']|undefined,capture:HttpFixturePrivateCapture|undefined;
  let execution:HttpFixtureRunResult|undefined;
  let failure:unknown;
  const current=async()=>{
   if(signal.aborted)throw new Error('aborted');
   await this.jobs.assertHttpBootstrapExecution(l,descriptor);
   const now=await this.lane.reserve(l,{origin:descriptor.origin,maxDecodedBytes:task.maxDecodedBytes});
   if(now.reservationId!==reservation.reservationId||now.invocationId!==reservation.invocationId||now.state!=='reserved'||signal.aborted)throw new Error('invocation_fenced');
  };
  try {
   await current();
   container=await this.engine.create();
   if(!/^[a-f0-9]{64}$/.test(container.id)||!/^[a-f0-9]{64}$/.test(container.imageDigest))throw new Error('invalid_container_identity');
   binding={lease:l,reservationId:reservation.reservationId,invocationId:reservation.invocationId,processInstanceId:randomUUID(),collectorBuildDigest:container.imageDigest,inputContextHash:manifestHash({profile:'isolated-http-fixture-v1',containerId:container.id,descriptor,task}),startedAt:new Date().toISOString()};
   await this.supervisor.bindInvocation(binding);bound=true;
   execution=await this.engine.start(container,{timeoutMs:wall,signal,beforeStart:current,onRequest:async signal=>{
    if(requested){protocolViolation=true;throw new Error('duplicate_broker_request');}
    requested=true;
    const collected=await runHttpFixtureBrokerCaptured(task,{signal,beforeRequest:current});
    broker=collected.receipt;capture=collected.capture;
    if(!broker.result)throw new Error('fixture_transport_failed');
    return broker.result;
   }});
  }catch(error){failure=error;}
  finally {
   clearInterval(heartbeat);
   // Independently confirm container removal; client exit never settles capacity.
   try{if(container)cleanup=await this.engine.cleanup(container);}
   finally{await pendingHeartbeat;}
  }
  if(!container||!cleanup||!bound||!binding)throw failure??new Error('invocation_not_bound');
  if(requested&&!broker)throw new Error('broker_termination_unverified');
  const stdout=execution?.stdout??Buffer.alloc(0);
  const parsed=execution?parseHttpFixtureResult(stdout,task.maxDecodedBytes):null;
  const valid=!signal.aborted&&!failure&&!protocolViolation&&execution?.state==='exited'&&cleanup.exitCode===0&&broker?.result&&parsed&&manifestHash(parsed)===manifestHash(broker.result);
  const finishedAt=broker&&broker.closedAt>cleanup.finishedAt?broker.closedAt:cleanup.finishedAt;
  const transcript={workerConformance:valid?'valid' as const:'invalid' as const,stdoutSha256:hash(stdout),state:execution?.state??'failed',exitCode:cleanup.exitCode,brokerClosedAt:broker?.closedAt??null,brokerResult:broker?.result??null,protocolViolation};
  const boundCapture=capture?{observedAt:capture.observedAt,receiptSha256:hash(Buffer.from(canonical({...capture.result,body_evidence_id:null}))),bodySha256:capture.body===null?null:hash(capture.body),bodyBytes:capture.body===null?null:capture.body.length}:null;
  const terminalReceiptId=await this.supervisor.recordTerminalReceipt({...binding,finishedAt,termination:cleanup.termination,resultDigest:manifestHash({profile:'isolated-http-fixture-v1',containerId:container.id,...transcript,capture:boundCapture}),actualDecodedBytes:null});
  await this.lane.settle(l,reservation.reservationId,terminalReceiptId);
  const result:IsolatedHttpFixtureResult={state:signal.aborted?'aborted':execution?.state==='timeout'?'timeout':valid?'completed':'failed',reservation:{...reservation,state:'settled'},terminalReceiptId,containerId:container.id,result:valid?parsed:null,evidenceAccepted:false};
  validate(base+'http-bootstrap-execution.schema.json',result);
  if(accept&&capture&&broker&&!signal.aborted&&!protocolViolation&&(valid||broker.result===null)){
   await accept({invocationId:reservation.invocationId,terminalReceiptId,containerId:container.id,imageDigest:container.imageDigest,fixturePort,observedAt:capture.observedAt,result:capture.result,body:capture.body,transcript:{...transcript,brokerClosedAt:broker.closedAt}});
  }
  return result;
 }
}
