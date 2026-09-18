import {randomUUID} from 'node:crypto';
import {hash,manifestHash,base,validate} from '../contracts/index.js';
import {parseOfflineRenderResult} from '../perception/render-result.js';
import {Jobs,type Lease} from './index.js';
import type {OfflineRenderAcceptanceInput} from './offline-render-acceptance.js';
import {RenderLane} from './render-lane.js';
import {RenderSupervisor,type RenderInvocationBinding} from './render-supervisor.js';
import type {OfflineRenderEngine,RenderContainer,RenderCleanup,RenderRunResult} from './docker-offline-render.js';
export interface OfflineRenderExecutionReceipt {
 state:'executed'|'failed'|'aborted'|'timeout';invocationId:string;terminalReceiptId:string;containerId:string;
 stdoutSha256:string;conformance:'valid'|'invalid'|'not_evaluated';workerState:'captured'|'policy_limited'|'failed'|'timeout'|null;evidenceAccepted:false;
}
/** Governed local tool producer. The injected engine is trusted infrastructure,
 * not a job/model parameter. No Evidence, RenderSnapshot or job completion is
 * authored here; the operational receipt cannot substitute for acceptance. */
export class OfflineRenderFixtureProducer {
 constructor(private jobs:Jobs,private lane:RenderLane,private supervisor:RenderSupervisor,private engine:OfflineRenderEngine){}
 async collect(lease:Lease,options:{signal?:AbortSignal;wallTimeoutMs?:number}={}):Promise<OfflineRenderExecutionReceipt>{
  return this.execute(lease,options);
 }
 /** Private host handoff; no stdout or form/resource content enters job options,
  * the queue, operational receipts or the caller response. */
 async collectAndAccept(lease:Lease,options:{signal?:AbortSignal;wallTimeoutMs?:number}={}){
  let acceptance:Awaited<ReturnType<Jobs['acceptOfflineRenderFixture']>>|undefined;
  const execution=await this.execute(lease,options,async input=>{acceptance=await this.jobs.acceptOfflineRenderFixture(lease,input);});
  if(!acceptance)throw new Error('render_result_not_acceptable');
  return {execution,acceptance};
 }
 private async execute(lease:Lease,options:{signal?:AbortSignal;wallTimeoutMs?:number},accept?:(input:OfflineRenderAcceptanceInput)=>Promise<void>):Promise<OfflineRenderExecutionReceipt>{
  const wall=options.wallTimeoutMs??25000;
  if(Object.keys(options).some(k=>!['signal','wallTimeoutMs'].includes(k))||!Number.isSafeInteger(wall)||wall<1||wall>25000)throw new Error('invalid_input');
  if(options.signal?.aborted)throw new Error('aborted');
  // This method must reject ordinary project leases before engine creation.
  const initial=await this.jobs.prepareOfflineRenderExecution(lease);
  const input={pageSnapshotId:initial.descriptor.pageSnapshotId,bundleId:initial.descriptor.bundleId,inputSha256:initial.prepared.inputSha256,profile:initial.prepared.profile};
  const reservation=await this.lane.reserve(lease,input);
  if(reservation.state!=='reserved')throw new Error('invocation_already_settled');
  const authority=new AbortController();
  const signal=options.signal?AbortSignal.any([options.signal,authority.signal]):authority.signal;
  let pendingHeartbeat:Promise<void>|null=null;
  const heartbeat=setInterval(()=>{
   if(pendingHeartbeat)return;
   pendingHeartbeat=this.jobs.heartbeat(lease).catch(()=>{authority.abort();}).finally(()=>{pendingHeartbeat=null;});
  },10000);
  let container:RenderContainer|undefined,binding:RenderInvocationBinding|undefined,bound=false,cleanup:RenderCleanup|undefined,preflightError:unknown;
  let run:RenderRunResult={stdout:Buffer.alloc(0),state:'failed'};
  try {
   if(signal.aborted)throw new Error('aborted');
   container=await this.engine.create();
   binding={lease,reservationId:reservation.reservationId,invocationId:reservation.invocationId,processInstanceId:randomUUID(),containerId:container.id,imageDigest:container.imageDigest,contextHash:reservation.sourceContextHash,startedAt:new Date().toISOString()};
   await this.supervisor.bindInvocation(binding);bound=true;
   const current=await this.jobs.prepareOfflineRenderExecution(lease);
   if(manifestHash(current.descriptor)!==manifestHash(initial.descriptor)||current.prepared.inputSha256!==input.inputSha256||hash(Buffer.from(current.prepared.html,'utf8'))!==input.inputSha256)throw new Error('source_context_changed');
   const live=await this.lane.reserve(lease,input);
   if(live.reservationId!==reservation.reservationId||live.invocationId!==reservation.invocationId||live.state!=='reserved'||signal.aborted)throw new Error('invocation_fenced');
   run=await this.engine.start(container,{url:current.prepared.url,html:current.prepared.html},{signal,timeoutMs:wall,beforeStart:async()=>{
    await this.jobs.assertOfflineRenderExecution(lease,initial.descriptor);
    const latest=await this.lane.reserve(lease,input);
    if(latest.invocationId!==reservation.invocationId||latest.state!=='reserved'||signal.aborted)throw new Error('invocation_fenced');
   }});
  }catch(error){preflightError=error;}
  finally {
   clearInterval(heartbeat);
   // Engine cleanup must independently confirm actual container termination and
   // removal. Client close or signal delivery never supplies a terminal witness.
   try{if(container)cleanup=await this.engine.cleanup(container);}
   finally{await pendingHeartbeat;}
  }
  if(!container||!binding||!bound||!cleanup)throw preflightError??new Error('render_termination_unverified');
  let conformance:OfflineRenderExecutionReceipt['conformance']='not_evaluated';
  let workerState:OfflineRenderExecutionReceipt['workerState']=null;
  if(!preflightError&&!signal.aborted&&run.state==='exited'&&cleanup.exitCode===0){
   try{const parsed=parseOfflineRenderResult(run.stdout,{url:initial.prepared.url,inputSha256:input.inputSha256,browserBuild:this.engine.browserBuild,startedAt:binding.startedAt,finishedAt:cleanup.finishedAt});workerState=parsed.state;conformance='valid';}catch{conformance='invalid';}
  }
  const state:OfflineRenderExecutionReceipt['state']=signal.aborted||run.state==='aborted'?'aborted':run.state==='timeout'?'timeout':workerState==='timeout'?'timeout':!preflightError&&conformance==='valid'&&(workerState==='captured'||workerState==='policy_limited')?'executed':'failed';
  const stdoutSha256=hash(run.stdout);
  const terminalReceiptId=await this.supervisor.recordTerminalReceipt({...binding,finishedAt:cleanup.finishedAt,termination:cleanup.termination,resultDigest:manifestHash({stdoutSha256,state,conformance,workerState,evidenceAccepted:false}),actualRequests:null,actualBytes:null});
  await this.lane.settle(lease,reservation.reservationId,terminalReceiptId);
  const receipt:OfflineRenderExecutionReceipt={state,invocationId:reservation.invocationId,terminalReceiptId,containerId:container.id,stdoutSha256,conformance,workerState,evidenceAccepted:false};
  validate(base+'offline-render-execution.schema.json',receipt);
  if(accept){
   if(conformance!=='valid')throw new Error('render_result_not_acceptable');
   await accept({stdout:run.stdout,receipt,browserBuild:this.engine.browserBuild,imageDigest:container.imageDigest});
  }
  return receipt;
 }
}
