import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {hash,manifestHash} from '../contracts/index.js';
export interface RenderContainer {id:string;imageDigest:string}
export interface RenderRunResult {stdout:Buffer;state:'exited'|'timeout'|'aborted'|'failed'|'output_limit'}
export interface RenderCleanup {finishedAt:string;termination:'exited'|'killed';exitCode:number|null}
/** Trusted control-plane adapter. Test doubles never establish actual execution proof. */
export interface OfflineRenderEngine {
 readonly browserBuild:string;
 create():Promise<RenderContainer>;
 start(container:RenderContainer,input:{url:string;html:string},options:{signal?:AbortSignal;timeoutMs:number;beforeStart:()=>Promise<void>}):Promise<RenderRunResult>;
 cleanup(container:RenderContainer):Promise<RenderCleanup>;
}
type CliResult={code:number|null;stdout:Buffer;stderr:string;state:RenderRunResult['state']};
const seccompDigest='1687636219aee3a7c27da967c7335bcc42ef6c0a93ec9597360f5ea8a2bff93d';
const seccomp=fileURLToPath(new URL('../../workers/render-fixture/seccomp.json',import.meta.url));
/** Fixed local Docker tool. Host configuration is trusted, never supplied in job input. */
export class DockerOfflineRenderEngine implements OfflineRenderEngine {
 readonly browserBuild:string;
 private readonly imageDigest:string;
 private readonly prefix:string[];
 private readonly owned=new Map<string,string>();
 private policyHash:string|null=null;
 constructor(config:{imageDigest:string;browserBuild:string;dockerContext?:string}){
  if(Object.keys(config).some(k=>!['imageDigest','browserBuild','dockerContext'].includes(k))||!/^[a-f0-9]{64}$/.test(config.imageDigest)||!/^\d+\.\d+\.\d+\.\d+$/.test(config.browserBuild)||config.dockerContext!==undefined&&!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(config.dockerContext))throw new Error('invalid_engine_config');
  this.imageDigest=config.imageDigest;this.browserBuild=config.browserBuild;this.prefix=config.dockerContext?['--context',config.dockerContext]:[];
 }
 private async command(args:string[],options:{input?:string;signal?:AbortSignal;timeoutMs?:number;limit?:number}={}):Promise<CliResult>{
  if(options.signal?.aborted)return {code:null,stdout:Buffer.alloc(0),stderr:'',state:'aborted'};
  return new Promise((resolve,reject)=>{
   const child=spawn('docker',[...this.prefix,...args],{stdio:['pipe','pipe','pipe']});
   let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),state:RenderRunResult['state']='exited',cleanup:ReturnType<typeof setTimeout>|undefined;
   const stop=(reason:RenderRunResult['state'])=>{if(state==='exited')state=reason;child.kill('SIGKILL');cleanup??=setTimeout(()=>{child.unref();child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();clearTimeout(timer);options.signal?.removeEventListener('abort',abort);reject(new Error('docker_client_uncertain'));},5000);};
   const abort=()=>stop('aborted');
   const timer=setTimeout(()=>stop('timeout'),options.timeoutMs??10000);
   options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
   child.stdout.on('data',(chunk:Buffer)=>{if(stdout.length+chunk.length>(options.limit??1048576)){stop('output_limit');return;}stdout=Buffer.concat([stdout,chunk]);});
   child.stderr.on('data',(chunk:Buffer)=>{if(stderr.length+chunk.length>65536){stop('output_limit');return;}stderr=Buffer.concat([stderr,chunk]);});
   child.stdin.on('error',e=>{if((e as NodeJS.ErrnoException).code!=='EPIPE')stop('failed');});
   child.on('error',()=>stop('failed'));
   child.once('close',code=>{clearTimeout(timer);clearTimeout(cleanup);options.signal?.removeEventListener('abort',abort);resolve({code,stdout,stderr:stderr.toString('utf8'),state});});
   child.stdin.end(options.input??'');
  });
 }
 private absent(result:CliResult,id:string){return result.state==='exited'&&result.code===1&&new RegExp('No such (?:container|object): '+id+'(?:\\s|$)','i').test(result.stderr);}
 private async inspect(id:string){
  const result=await this.command(['container','inspect',id,'--format','{{json .}}']);
  if(result.state!=='exited'||result.code!==0)throw new Error('container_state_uncertain');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result.stdout));}catch{throw new Error('container_state_uncertain');}
 }
 private verifyIdentity(value:any,container:RenderContainer){
  const nonce=this.owned.get(container.id);
  if(!nonce||container.imageDigest!==this.imageDigest||value.Id!==container.id||value.Image!=='sha256:'+this.imageDigest||value.Config?.Labels?.['aios.offline-invocation']!==nonce)throw new Error('container_identity_mismatch');
 }
 private verify(value:any,container:RenderContainer){
  this.verifyIdentity(value,container);
  let actualPolicy:string;
  try{actualPolicy=manifestHash(JSON.parse(value.HostConfig.SecurityOpt.find((x:string)=>x.startsWith('seccomp=')).slice(8)));}catch{throw new Error('container_policy_mismatch');}
  if(!this.policyHash||actualPolicy!==this.policyHash)throw new Error('container_policy_mismatch');
  const nonce=this.owned.get(container.id),h=value.HostConfig,c=value.Config;
  if(!nonce||container.imageDigest!==this.imageDigest||value.Id!==container.id||value.Image!=='sha256:'+this.imageDigest||c?.Labels?.['aios.offline-invocation']!==nonce||c.User!=='pwuser'||c.WorkingDir!=='/opt/aios-render'||JSON.stringify(c.Entrypoint)!==JSON.stringify(['node','worker.mjs'])||c.Cmd!==null&&c.Cmd?.length!==0||c.OpenStdin!==true||c.Tty!==false||h?.NetworkMode!=='none'||h.ReadonlyRootfs!==true||h.Privileged!==false||h.Init!==true||h.Memory!==805306368||h.NanoCpus!==1000000000||h.PidsLimit!==128||h.ShmSize!==134217728||h.PidMode!==''||h.IpcMode!=='private'||h.Binds?.length||h.CapAdd?.length||JSON.stringify(h.CapDrop)!==JSON.stringify(['ALL'])||!h.SecurityOpt?.includes('no-new-privileges')||!h.SecurityOpt?.some((x:string)=>x.startsWith('seccomp='))||Object.keys(h.Tmpfs??{}).join(',')!=='/tmp'||h.Tmpfs['/tmp']!=='rw,nosuid,nodev,size=134217728'||value.Mounts?.some((m:any)=>m.Type!=='tmpfs'))throw new Error('container_policy_mismatch');
 }
 async create():Promise<RenderContainer>{
  const policy=await readFile(seccomp);
  if(hash(policy)!==seccompDigest)throw new Error('seccomp_integrity_failed');
  this.policyHash=manifestHash(JSON.parse(policy.toString('utf8')));
  const nonce=randomUUID(),name='aios-offline-'+nonce;
  const created=await this.command(['create','--name',name,'--label','aios.offline-invocation='+nonce,'-i','--init','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--security-opt','seccomp='+seccomp,'--memory','768m','--cpus','1','--pids-limit','128','--shm-size','128m','--tmpfs','/tmp:rw,nosuid,nodev,size=134217728','-e','XDG_CONFIG_HOME=/tmp/config','-e','XDG_CACHE_HOME=/tmp/cache','sha256:'+this.imageDigest]);
  // Resolve even an uncertain create by our unique name and label. Never remove
  // another invocation's container or interpret client failure as termination.
  const found=await this.inspect(name);const container={id:found.Id as string,imageDigest:this.imageDigest};
  if(!/^[a-f0-9]{64}$/.test(container.id)||found.Config?.Labels?.['aios.offline-invocation']!==nonce)throw new Error('container_state_uncertain');
  this.owned.set(container.id,nonce);
  try{
   this.verify(found,container);
   if(created.state!=='exited'||created.code!==0||created.stdout.toString().trim()!==container.id||found.State?.Status!=='created'||found.State.Running!==false)throw new Error('container_create_failed');
   return container;
  }catch(error){await this.cleanup(container);throw error;}
 }
 async start(container:RenderContainer,input:{url:string;html:string},options:{signal?:AbortSignal;timeoutMs:number;beforeStart:()=>Promise<void>}):Promise<RenderRunResult>{
  const found=await this.inspect(container.id);this.verify(found,container);
  if(found.State?.Status!=='created'||found.State.Running!==false||typeof input.html!=='string'||Buffer.byteLength(input.html)>5242880||Buffer.from(input.html).toString()!==input.html||!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>25000)throw new Error('container_start_denied');
  await options.beforeStart();
  const result=await this.command(['start','--attach','--interactive',container.id],{input:JSON.stringify(input),timeoutMs:options.timeoutMs,limit:20*1024*1024,...(options.signal?{signal:options.signal}:{})});
  return {stdout:result.stdout,state:result.state==='exited'&&result.code!==0?'failed':result.state};
 }
 async cleanup(container:RenderContainer):Promise<RenderCleanup>{
  let found=await this.inspect(container.id);this.verifyIdentity(found,container);
  let termination:RenderCleanup['termination']=found.State?.Status==='exited'?'exited':'killed';
  if(found.State?.Running===true){
   await this.command(['kill','--signal','KILL',container.id]);
   found=await this.inspect(container.id);this.verifyIdentity(found,container);
  }
  if(found.State?.Running!==false||!['exited','created','dead'].includes(found.State.Status))throw new Error('container_termination_uncertain');
  const exitCode=found.State.Status==='exited'&&Number.isInteger(found.State.ExitCode)?found.State.ExitCode:null;
  const removed=await this.command(['rm','--force',container.id]);
  if(removed.state!=='exited'||removed.code!==0)throw new Error('container_cleanup_uncertain');
  const absent=await this.command(['container','inspect',container.id]);
  if(!this.absent(absent,container.id))throw new Error('container_cleanup_uncertain');
  this.owned.delete(container.id);
  return {finishedAt:new Date().toISOString(),termination,exitCode};
 }
}
