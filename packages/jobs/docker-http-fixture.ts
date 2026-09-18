import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
export interface HttpFixtureContainer {id:string;imageDigest:string}
export interface HttpFixtureMetadata {status:number;truncated:boolean;retainedBodyBytes:number;retainedBodySha256:string|null}
export interface HttpFixtureRunResult {stdout:Buffer;state:'exited'|'timeout'|'aborted'|'failed'|'output_limit'|'protocol_error'}
export interface HttpFixtureCleanup {finishedAt:string;termination:'exited'|'killed';exitCode:number|null}
export interface HttpFixtureStartOptions {beforeStart:()=>Promise<void>;onRequest:(signal:AbortSignal)=>Promise<HttpFixtureMetadata>;signal?:AbortSignal;timeoutMs:number}
export interface HttpFixtureEngine {create():Promise<HttpFixtureContainer>;start(container:HttpFixtureContainer,options:HttpFixtureStartOptions):Promise<HttpFixtureRunResult>;cleanup(container:HttpFixtureContainer):Promise<HttpFixtureCleanup>}
export function validHttpFixtureMetadata(value:unknown,maxBytes:number):value is HttpFixtureMetadata {
 if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>5242880)return false;
 const m=value as HttpFixtureMetadata;
 return Object.keys(m).sort().join(',')==='retainedBodyBytes,retainedBodySha256,status,truncated'&&Number.isInteger(m.status)&&m.status>=100&&m.status<=599&&typeof m.truncated==='boolean'&&Number.isInteger(m.retainedBodyBytes)&&m.retainedBodyBytes>=0&&m.retainedBodyBytes<=maxBytes&&(m.retainedBodySha256===null&&m.retainedBodyBytes===0||typeof m.retainedBodySha256==='string'&&/^[a-f0-9]{64}$/.test(m.retainedBodySha256));
}
export function parseHttpFixtureResult(stdout:Uint8Array,maxBytes:number):HttpFixtureMetadata|null {
 try{if(stdout.byteLength>4096)return null;const lines=new TextDecoder('utf-8',{fatal:true}).decode(stdout).split('\n');if(lines.length!==3||lines[2]!==''||lines.some(x=>x.includes('\r')))return null;
 const request=JSON.parse(lines[0]!),response=JSON.parse(lines[1]!);if(JSON.stringify(request)!==lines[0]||JSON.stringify(response)!==lines[1])return null;
 if(!request||Object.keys(request).join(',')!=='kind'||request.kind!=='fetch'||!response||Object.keys(response).sort().join(',')!=='kind,metadata'||response.kind!=='result'||!validHttpFixtureMetadata(response.metadata,maxBytes))return null;return response.metadata;
 }catch{return null;}
}
/** Bounded framing state machine; callbacks are trusted host capabilities, never worker arguments. */
export class HttpFixtureProtocol {
 private buffer=Buffer.alloc(0);private total=0;private requested=false;private responded=false;private result=false;private invalid=false;
 pending:Promise<void>|null=null;
 constructor(private request:()=>Promise<HttpFixtureMetadata>,private write:(line:string)=>void,private fail:()=>void){}
 private deny(){if(!this.invalid){this.invalid=true;this.fail();}}
 feed(chunk:Buffer){
  if(this.invalid)return;this.total+=chunk.length;if(this.total>4096)return this.deny();this.buffer=Buffer.concat([this.buffer,chunk]);
  while(this.buffer.includes(10)){
   const end=this.buffer.indexOf(10),line=this.buffer.subarray(0,end);this.buffer=this.buffer.subarray(end+1);if(line.length>2048)return this.deny();
   let frame:any;try{const text=new TextDecoder('utf-8',{fatal:true}).decode(line);if(text.includes('\r'))throw new Error();frame=JSON.parse(text);if(JSON.stringify(frame)!==text)throw new Error();}catch{return this.deny();}
   if(!this.requested){
    if(!frame||Object.keys(frame).join(',')!=='kind'||frame.kind!=='fetch')return this.deny();this.requested=true;
    this.pending=Promise.resolve().then(async()=>{if(this.invalid)return;const metadata=await this.request();if(this.invalid)return;if(!validHttpFixtureMetadata(metadata,5242880))return this.deny();this.responded=true;this.write(JSON.stringify({kind:'response',metadata})+'\n');}).catch(()=>this.deny());
   }else{
    if(!this.responded||this.result||!frame||Object.keys(frame).sort().join(',')!=='kind,metadata'||frame.kind!=='result'||!validHttpFixtureMetadata(frame.metadata,5242880))return this.deny();this.result=true;
   }
  }
  if(this.buffer.length>2048)this.deny();
 }
 end(){if(this.buffer.length||!this.result||this.invalid){this.deny();return false;}return true;}
}
type CliResult={code:number|null;stdout:Buffer;stderr:string;state:HttpFixtureRunResult['state']};
/** Fixed local Docker tool. Host configuration is trusted, never supplied in job input. */
export class DockerHttpFixtureEngine implements HttpFixtureEngine {
 private readonly imageDigest:string;
 private readonly prefix:string[];
 private readonly owned=new Map<string,string>();
 constructor(config:{imageDigest:string;dockerContext?:string}){
  if(Object.keys(config).some(k=>!['imageDigest','dockerContext'].includes(k))||!/^[a-f0-9]{64}$/.test(config.imageDigest)||config.dockerContext!==undefined&&!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(config.dockerContext))throw new Error('invalid_engine_config');
  this.imageDigest=config.imageDigest;this.prefix=config.dockerContext?['--context',config.dockerContext]:[];
 }
 private async command(args:string[],options:{input?:string;signal?:AbortSignal;timeoutMs?:number;limit?:number}={}):Promise<CliResult>{
  if(options.signal?.aborted)return {code:null,stdout:Buffer.alloc(0),stderr:'',state:'aborted'};
  return new Promise((resolve,reject)=>{
   const child=spawn('docker',[...this.prefix,...args],{stdio:['pipe','pipe','pipe']});
   let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),state:HttpFixtureRunResult['state']='exited',cleanup:ReturnType<typeof setTimeout>|undefined;
   const stop=(reason:HttpFixtureRunResult['state'])=>{if(state==='exited')state=reason;child.kill('SIGKILL');cleanup??=setTimeout(()=>{child.unref();child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();clearTimeout(timer);options.signal?.removeEventListener('abort',abort);reject(new Error('docker_client_uncertain'));},5000);};
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
 private async communicate(container:HttpFixtureContainer,options:HttpFixtureStartOptions):Promise<HttpFixtureRunResult>{
  return new Promise((resolve,reject)=>{
   const child=spawn('docker',[...this.prefix,'start','--attach','--interactive',container.id],{stdio:['pipe','pipe','pipe']});
   const brokerAbort=new AbortController();let stdout=Buffer.alloc(0),stderrBytes=0,state:HttpFixtureRunResult['state']='exited',closed=false,cleanup:ReturnType<typeof setTimeout>|undefined;
   const stop=(reason:HttpFixtureRunResult['state'])=>{
    if(state==='exited')state=reason;brokerAbort.abort();if(closed)return;child.kill('SIGKILL');
    cleanup??=setTimeout(()=>{child.unref();child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();clearTimeout(timer);options.signal?.removeEventListener('abort',abort);reject(new Error('docker_client_uncertain'));},5000);
   };
   const protocol=new HttpFixtureProtocol(()=>options.onRequest(brokerAbort.signal),line=>child.stdin.end(line),()=>stop('protocol_error'));
   const abort=()=>stop('aborted'),timer=setTimeout(()=>stop('timeout'),options.timeoutMs);
   options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
   child.stdout.on('data',(chunk:Buffer)=>{if(stdout.length+chunk.length>4096){stop('output_limit');return;}stdout=Buffer.concat([stdout,chunk]);protocol.feed(chunk);});
   child.stderr.on('data',(chunk:Buffer)=>{stderrBytes+=chunk.length;if(stderrBytes>4096)stop('output_limit');});
   child.stdin.on('error',()=>stop('failed'));child.on('error',()=>stop('failed'));
   child.once('close',code=>{
    closed=true;clearTimeout(timer);clearTimeout(cleanup);options.signal?.removeEventListener('abort',abort);
    if(code!==0&&state==='exited')state='failed';protocol.end();brokerAbort.abort();
    // CLI close is neither container termination nor broker socket termination.
    // Drain the trusted callback; unknown cleanup never becomes a success result.
    let drain:ReturnType<typeof setTimeout>;
    const uncertain=new Promise<never>((_resolve,fail)=>{drain=setTimeout(()=>fail(new Error('broker_state_uncertain')),5000);});
    Promise.race([protocol.pending??Promise.resolve(),uncertain]).then(()=>{clearTimeout(drain);resolve({stdout,state});},error=>{clearTimeout(drain);reject(error);});
   });
  });
 }
 private absent(result:CliResult,id:string){return result.state==='exited'&&result.code===1&&new RegExp('No such (?:container|object): '+id+'(?:\\s|$)','i').test(result.stderr);}
 private async inspect(id:string){
  const result=await this.command(['container','inspect',id,'--format','{{json .}}']);
  if(result.state!=='exited'||result.code!==0)throw new Error('container_state_uncertain');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result.stdout));}catch{throw new Error('container_state_uncertain');}
 }
 private verifyIdentity(value:any,container:HttpFixtureContainer){
  const nonce=this.owned.get(container.id);
  if(!nonce||container.imageDigest!==this.imageDigest||value.Id!==container.id||value.Image!=='sha256:'+this.imageDigest||value.Config?.Labels?.['aios.http-invocation']!==nonce)throw new Error('container_identity_mismatch');
 }
 private verify(value:any,container:HttpFixtureContainer){
  this.verifyIdentity(value,container);
  const nonce=this.owned.get(container.id),h=value.HostConfig,c=value.Config;
  if(!Array.isArray(c?.Env)||c.Env.length!==4||!c.Env.includes('HOME=/home/node')||!c.Env.some((x:string)=>/^NODE_VERSION=24\.\d+\.\d+$/.test(x))||!c.Env.some((x:string)=>/^YARN_VERSION=\d+\.\d+\.\d+$/.test(x))||!c.Env.includes('PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'))throw new Error('container_policy_mismatch');
  if(!nonce||container.imageDigest!==this.imageDigest||value.Id!==container.id||value.Image!=='sha256:'+this.imageDigest||c?.Labels?.['aios.http-invocation']!==nonce||c.User!=='node'||c.WorkingDir!=='/opt/aios-http'||JSON.stringify(c.Entrypoint)!==JSON.stringify(['node','--max-old-space-size=48','worker.mjs'])||c.Cmd!==null&&c.Cmd?.length!==0||c.OpenStdin!==true||c.Tty!==false||h?.NetworkMode!=='none'||h.ReadonlyRootfs!==true||h.Privileged!==false||h.Init!==true||h.Memory!==134217728||h.NanoCpus!==500000000||h.PidsLimit!==64||h.ShmSize!==16777216||h.PidMode!==''||h.IpcMode!=='private'||h.Binds?.length||h.CapAdd?.length||JSON.stringify(h.CapDrop)!==JSON.stringify(['ALL'])||JSON.stringify(h.SecurityOpt)!==JSON.stringify(['no-new-privileges'])||Object.keys(h.Tmpfs??{}).join(',')!=='/tmp'||h.Tmpfs['/tmp']!=='rw,nosuid,nodev,size=16777216'||value.Mounts?.some((m:any)=>m.Type!=='tmpfs'))throw new Error('container_policy_mismatch');
 }
 async create():Promise<HttpFixtureContainer>{
  const security=await this.command(['info','--format','{{json .SecurityOptions}}']);
  if(security.state!=='exited'||security.code!==0||!JSON.parse(security.stdout.toString('utf8')).some((x:unknown)=>typeof x==='string'&&x==='name=seccomp,profile=builtin'))throw new Error('docker_seccomp_required');
  const nonce=randomUUID(),name='aios-http-'+nonce;
  const created=await this.command(['create','--name',name,'--label','aios.http-invocation='+nonce,'-i','--init','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','128m','--cpus','0.5','--pids-limit','64','--shm-size','16m','--tmpfs','/tmp:rw,nosuid,nodev,size=16777216','sha256:'+this.imageDigest]);
  // Resolve even an uncertain create by our unique name and label. Never remove
  // another invocation's container or interpret client failure as termination.
  const found=await this.inspect(name);const container={id:found.Id as string,imageDigest:this.imageDigest};
  if(!/^[a-f0-9]{64}$/.test(container.id)||found.Config?.Labels?.['aios.http-invocation']!==nonce)throw new Error('container_state_uncertain');
  this.owned.set(container.id,nonce);
  try{
   this.verify(found,container);
   if(created.state!=='exited'||created.code!==0||created.stdout.toString().trim()!==container.id||found.State?.Status!=='created'||found.State.Running!==false)throw new Error('container_create_failed');
   return container;
  }catch(error){await this.cleanup(container);throw error;}
 }
 async start(container:HttpFixtureContainer,options:HttpFixtureStartOptions):Promise<HttpFixtureRunResult>{
  const found=await this.inspect(container.id);this.verify(found,container);
  if(found.State?.Status!=='created'||found.State.Running!==false||!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>25000||options.signal?.aborted)throw new Error('container_start_denied');
  await options.beforeStart();
  if(options.signal?.aborted)return {stdout:Buffer.alloc(0),state:'aborted'};
  return this.communicate(container,options);
 }
 async cleanup(container:HttpFixtureContainer):Promise<HttpFixtureCleanup>{
  let found=await this.inspect(container.id);this.verifyIdentity(found,container);
  let termination:HttpFixtureCleanup['termination']=found.State?.Status==='exited'?'exited':'killed';
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
