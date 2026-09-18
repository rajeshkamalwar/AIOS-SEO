import { Worker } from 'node:worker_threads';
import type { HtmlExtraction,HtmlSource } from './dom.js';

const maximumBytes=5242880,maximumWallMs=2000;
const budget=():HtmlExtraction=>({state:'not_extracted',reason:'parser_budget'});

/** Separate V8 heap + wall-time budget for trusted inert parse5, NOT an OS/JS sandbox.
 * Node's resourceLimits exclude external ArrayBuffers and global process OOM:
 * https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#new-workerfilename-options
 * Input/clone sizes are separately bounded; live execution still needs process limits.
 */
export async function extractHtmlIsolated(bytes:Uint8Array,source:HtmlSource,options:{timeoutMs?:number}={}):Promise<HtmlExtraction>{
 if(!(bytes instanceof Uint8Array)||!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='timeoutMs'))throw new Error('schema_invalid');
 const start=performance.now(),timeout=options.timeoutMs??maximumWallMs;
 if(!Number.isInteger(timeout)||timeout<1||timeout>maximumWallMs)throw new Error('parser_limits');
 if(bytes.byteLength>maximumBytes)return {state:'not_extracted',reason:'input_budget'};
 if(!source||typeof source!=='object'||Array.isArray(source)||typeof source.evidenceId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source.evidenceId)||typeof source.sha256!=='string'||!/^[0-9a-f]{64}$/.test(source.sha256)||
  typeof source.responseUrl!=='string'||source.responseUrl.length>4096||typeof source.contentType!=='string'||source.contentType.length>4096||
  typeof source.truncated!=='boolean'||typeof source.policyLimited!=='boolean'||Object.keys(source).some(k=>!['evidenceId','sha256','responseUrl','contentType','truncated','policyLimited'].includes(k)))throw new Error('schema_invalid');
 // Do not inherit preload scripts, NODE_OPTIONS or process environment secrets.
 // Explicit Node heap flags may override worker resourceLimits; fail closed.
 const heapOverride=/--max[-_](old[-_]space|semi[-_]space)[-_]size/;
 if(process.execArgv.some(v=>heapOverride.test(v))||heapOverride.test(process.env.NODE_OPTIONS??''))return budget();
 const data=Uint8Array.from(bytes),context:HtmlSource={evidenceId:source.evidenceId,sha256:source.sha256,responseUrl:source.responseUrl,contentType:source.contentType,truncated:source.truncated,policyLimited:source.policyLimited};
 const typescript=import.meta.url.endsWith('.ts');
 const entry=new URL(typescript?'./dom-worker.ts':'./dom-worker.js',import.meta.url);
 let worker:Worker;
 try{
  // The source-only loader bootstraps trusted local TS modules. Compiled runtime
  // directly imports dom-worker.js and has no tsx dependency at execution time.
  worker=typescript?new Worker(`import('tsx/esm/api').then(({register})=>{register();return import(${JSON.stringify(entry.href)});});`,{
   eval:true,workerData:{bytes:data,source:context},transferList:[data.buffer],env:{},execArgv:[],
   resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,codeRangeSizeMb:16,stackSizeMb:4},
  }):new Worker(entry,{
   workerData:{bytes:data,source:context},transferList:[data.buffer],env:{},execArgv:[],
   resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,codeRangeSizeMb:16,stackSizeMb:4},
  });
 }catch{return budget();}
 return new Promise<HtmlExtraction>((resolve,reject)=>{
  let finished=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const finish=async(value:HtmlExtraction,error?:string)=>{
   if(finished)return;
   finished=true;clearTimeout(timer);
   try{await worker.terminate();}catch{value=budget();}
   worker.removeAllListeners();
   if(error)reject(new Error(error));else resolve(value);
  };
  // Includes worker startup/loader/parse/result-copy time. Late messages lose.
  timer=setTimeout(()=>{void finish(budget());},Math.max(0,timeout-(performance.now()-start)));
  worker.once('message',(message:unknown)=>{
   if(performance.now()-start>=timeout){void finish(budget());return;}
   const response=message as {kind?:string;value?:HtmlExtraction;code?:string}|null;
   if(response?.kind==='result'&&response.value&&['extracted','not_extracted'].includes(response.value.state))void finish(response.value);
   else if(response?.kind==='error'&&['artifact_integrity_failed','schema_invalid'].includes(response.code??''))void finish(budget(),response.code);
   else void finish(budget());
  });
  worker.once('error',()=>{void finish(budget());});
  worker.once('exit',()=>{void finish(budget());});
 });
}
