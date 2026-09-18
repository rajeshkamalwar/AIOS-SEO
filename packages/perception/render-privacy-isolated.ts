import {Worker} from 'node:worker_threads';
import {hash} from '../contracts/index.js';
import {privacyLimit,validPrivacyString,type RenderPrivacyProjection} from './render-privacy.js';
const budget=():RenderPrivacyProjection=>({state:'not_retainable',reason:'budget_exceeded'});
/** Separate heap/time bound for trusted inert parser; not an OS sandbox. */
export async function projectRenderDomPrivacyIsolated(dom:string,options:{timeoutMs?:number}={}):Promise<RenderPrivacyProjection>{
 if(typeof dom!=='string')return {state:'not_retainable',reason:'invalid_encoding'};
 if(dom.length>privacyLimit||Buffer.byteLength(dom,'utf8')>privacyLimit)return budget();
 if(!validPrivacyString(dom))return {state:'not_retainable',reason:'invalid_encoding'};
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='timeoutMs')||!Number.isSafeInteger(options.timeoutMs??2000)||(options.timeoutMs??2000)<1||(options.timeoutMs??2000)>2000)throw new Error('invalid_input');
 const override=/--max[-_](old[-_]space|semi[-_]space)[-_]size/;
 if(process.execArgv.some(v=>override.test(v))||override.test(process.env.NODE_OPTIONS??''))return budget();
 const began=performance.now(),timeout=options.timeoutMs??2000;
 const entry=new URL(import.meta.url.endsWith('.ts')?'./render-privacy-worker.ts':'./render-privacy-worker.js',import.meta.url);
 let worker:Worker;
 try{const settings={workerData:dom,env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,codeRangeSizeMb:16,stackSizeMb:4}};
  worker=import.meta.url.endsWith('.ts')?new Worker(`import('tsx/esm/api').then(({register})=>{register();return import(${JSON.stringify(entry.href)});});`,{...settings,eval:true}):new Worker(entry,settings);
 }catch{return budget();}
 return new Promise(resolve=>{
  let done=false,timer:ReturnType<typeof setTimeout>;
  const finish=async(result:RenderPrivacyProjection)=>{if(done)return;done=true;clearTimeout(timer);try{await worker.terminate();}catch{result=budget();}worker.removeAllListeners();resolve(result);};
  timer=setTimeout(()=>{void finish(budget());},Math.max(0,timeout-(performance.now()-began)));
  worker.once('message',(value:unknown)=>{
   if(performance.now()-began>=timeout){void finish(budget());return;}
   const result=value as RenderPrivacyProjection;
   if(result?.state==='not_retainable'&&['invalid_encoding','budget_exceeded','parse_failed'].includes(result.reason)){void finish({state:result.state,reason:result.reason});return;}
   if(result?.state!=='projected'||!(result.bytes instanceof Uint8Array)||result.bytes.length>privacyLimit||result.redactionVersion!=='render-privacy-v1'||result.originalSha256!==hash(Buffer.from(dom,'utf8'))||result.sha256!==hash(result.bytes)||!Array.isArray(result.limitations)||result.limitations.length>16||result.limitations.some(x=>typeof x!=='string'||x.length>256)){void finish(budget());return;}
   void finish({state:'projected',bytes:Buffer.from(result.bytes),originalSha256:result.originalSha256,sha256:result.sha256,redactionVersion:'render-privacy-v1',limitations:[...result.limitations]});
  });
  worker.once('error',()=>{void finish(budget());});worker.once('exit',()=>{void finish(budget());});
 });
}
