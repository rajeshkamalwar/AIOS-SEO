import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseOfflineRenderResult } from '../packages/perception/render-result.ts';
import { extractHtmlIsolated } from '../packages/perception/dom-isolated.ts';
import { hash } from '../packages/contracts/index.ts';

const directory=fileURLToPath(new URL('../workers/render-fixture/',import.meta.url));
const seccomp=fileURLToPath(new URL('../workers/render-fixture/seccomp.json',import.meta.url));
const image='aios-seo-render-fixture';
const context=process.env.AIOS_DOCKER_CONTEXT;
if(context!==undefined&&!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(context))throw new Error('invalid_docker_context');
const prefix=context?['--context',context]:[];
const maxOutput=20*1024*1024;

function docker(args,{input='',timeoutMs=35000,allowFailure=false}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn('docker',[...prefix,...args],{stdio:['pipe','pipe','pipe']});
  const out=[],err=[];let bytes=0,failure;
  const fail=(error)=>{failure??=error;child.kill('SIGKILL');};
  const timer=setTimeout(()=>fail(new Error('docker_host_timeout')),timeoutMs);
  const collect=(parts)=>(chunk)=>{bytes+=chunk.length;if(bytes>maxOutput){fail(new Error('docker_output_limit'));return;}parts.push(chunk);};
  child.stdout.on('data',collect(out));child.stderr.on('data',collect(err));
  child.on('error',(error)=>{failure??=error;});
  // A rejected input can close stdin before the host finishes writing.
  child.stdin.on('error',(error)=>{if(error.code!=='EPIPE')fail(error);});
  child.on('close',(code)=>{
   clearTimeout(timer);
   if(failure){reject(failure);return;}
   const stdoutBytes=Buffer.concat(out);
   const result={code,stdoutBytes,stdout:stdoutBytes.toString('utf8'),stderr:Buffer.concat(err).toString('utf8')};
   if(code!==0&&!allowFailure){reject(new Error('docker_failed: '+result.stderr.slice(-4096)));return;}
   resolve(result);
  });
  child.stdin.end(input);
 });
}

const runFlags=[
 '--init','--network','none','--read-only','--cap-drop','ALL',
 '--security-opt','no-new-privileges','--security-opt','seccomp='+seccomp,
 '--memory','768m','--cpus','1','--pids-limit','128','--shm-size','128m',
 '--tmpfs','/tmp:rw,nosuid,nodev,size=134217728',
 '-e','XDG_CONFIG_HOME=/tmp/config','-e','XDG_CACHE_HOME=/tmp/cache',
];
async function runContainer({input='',timeoutMs=35000,buildProbe=false,echoProbe=false}={}){
 const name='aios-render-test-'+randomUUID();
 try {
  // Read expected build from installed package metadata, independently of the
  // untrusted render receipt. This is fixture-image conformance, not attestation.
  const command=echoProbe?['-e','process.stdin.pipe(process.stdout)']:buildProbe?['--input-type=module','-e',"import{readFileSync}from'node:fs';const b=JSON.parse(readFileSync('node_modules/playwright-core/browsers.json'));process.stdout.write(b.browsers.find(x=>x.name==='chromium').browserVersion)"]:[];
  return await docker(['run','--name',name,'-i',...runFlags,...(buildProbe||echoProbe?['--entrypoint','node']:[]),image,...command],{input,timeoutMs});
 } finally {
  // Kill the named container even if the Docker client was killed, output overflowed,
  // parsing failed, or hostile code hung Chromium. Never leave a background worker.
  const removed=await docker(['rm','--force',name],{timeoutMs:10000,allowFailure:true});
  assert.ok(removed.code===0||/No such (container|object)/i.test(removed.stderr),'container removal failed: '+removed.stderr.slice(-1024));
  const check=await docker(['container','inspect',name],{timeoutMs:10000,allowFailure:true});
  assert.notEqual(check.code,0,'render container survived cleanup');
  assert.match(check.stderr,/No such (container|object)/i,'container absence was not confirmed');
 }
}

let expectedBuild;
async function render(input,{timeoutMs=35000,expectedUrl=input.url}={}){
 const result=await runContainer({input:JSON.stringify(input),timeoutMs});
 return parseOfflineRenderResult(result.stdoutBytes,{url:expectedUrl,browserBuild:expectedBuild});
}

await docker(['build','--tag',image,directory],{timeoutMs:120000});
const imageInfo=await docker(['image','inspect',image,'--format','{{.Config.User}}']);
assert.equal(imageInfo.stdout.trim(),'pwuser','renderer must use nonroot image user');
expectedBuild=(await runContainer({buildProbe:true})).stdout.trim();
assert.match(expectedBuild,/^\d+\.\d+\.\d+\.\d+$/);

const url='https://render.example/';
const positive=await render({url,html:`<!doctype html><html><head><title>Fixture</title></head><body><main id="state">initial</main><script>
 setTimeout(()=>document.getElementById('state').textContent='second',500);
 setTimeout(()=>document.getElementById('state').textContent='third',3000);
</script></body></html>`});
assert.equal(positive.url,url);
assert.equal(positive.state,'captured');
assert.equal(positive.deniedCount,0);
assert.equal(typeof positive.browserBuild,'string');assert.ok(positive.browserBuild.length>0);
assert.deepEqual(positive.sandbox,{namespace:true,pid:true,network:true,seccomp:true});
assert.deepEqual(positive.samples.map(s=>s.offsetMs),[0,2000,5000]);
for(let i=0;i<3;i++){
 const sample=positive.samples[i];
 assert.ok(Number.isFinite(sample.actualOffsetMs)&&sample.actualOffsetMs>=sample.offsetMs);
 assert.ok(sample.actualOffsetMs<20000);
 assert.match(sample.dom,new RegExp('<main id="state">'+['initial','second','third'][i]+'</main>'));
}
console.log('PASS isolated Chromium captures real inline JS at 0/2/5 seconds');

const invalidEncoding={...positive,samples:positive.samples.map(s=>({...s,dom:'INVALID_UTF8_MARKER'}))};
const invalidBytes=Buffer.from(JSON.stringify(invalidEncoding));
invalidBytes[invalidBytes.indexOf('INVALID_UTF8_MARKER')]=0xff;
const echoed=await runContainer({input:invalidBytes,echoProbe:true});
assert.deepEqual(echoed.stdoutBytes,invalidBytes);
assert.throws(()=>parseOfflineRenderResult(echoed.stdoutBytes,{url,browserBuild:expectedBuild}),/render_result_invalid/);
console.log('PASS host preserves and rejects invalid UTF-8 worker output');

for(const sample of positive.samples){
 const bytes=Buffer.from(sample.dom),source={evidenceId:randomUUID(),sha256:hash(bytes),responseUrl:url,contentType:'text/html; charset=utf-8',truncated:false,policyLimited:false};
 const extracted=await extractHtmlIsolated(bytes,source);
 assert.equal(extracted.state,'extracted');
 assert.equal(extracted.mainText.text,['initial','second','third'][positive.samples.indexOf(sample)]);
 assert.equal(extracted.mainText.visibility,'not_observed');
 for(const segment of extracted.mainText.segments){
  assert.equal(segment.source.sha256,source.sha256);
  const [,start,end]=segment.source.locator.split(':').map(Number);
  assert.equal(bytes.subarray(start,end).toString(),segment.value);
 }
}
console.log('PASS validated real DOM samples preserve extraction byte provenance');

await assert.rejects(render({url,html:'<!doctype html><main id="bad"></main><script>document.getElementById("bad").textContent=String.fromCharCode(0xd800)</script>'}),/render_result_invalid/);
console.log('PASS non-UTF-8-representable browser DOM is rejected without silent replacement');

const adverse=await render({url,html:`<!doctype html><html><body><main>fixture only</main><script>
 fetch('https://outside.example/get').catch(()=>{});
 fetch('http://127.0.0.1/private').catch(()=>{});
 fetch('https://outside.example/post',{method:'POST',body:'fixture'}).catch(()=>{});
 navigator.sendBeacon('https://outside.example/beacon','fixture');
 try {new WebSocket('wss://outside.example/socket');} catch {}
 window.open('https://outside.example/popup');
</script></body></html>`});
assert.equal(adverse.state,'policy_limited');
assert.ok(adverse.deniedCount>=6,'all attempted fixture requests must be recorded');
for(const suffix of ['/get','/private','/post','/beacon','/socket','/popup']){
 assert.ok(adverse.deniedRequests.some(r=>r.url.endsWith(suffix)&&typeof r.reason==='string'&&r.reason.length>0),'missing denial '+suffix);
}
assert.ok(adverse.deniedRequests.some(r=>r.method==='POST'));
assert.deepEqual(adverse.sandbox,{namespace:true,pid:true,network:true,seccomp:true});
console.log('PASS private/public requests, POST, beacon, socket and popup are denied');

const burst=await render({url,html:'<!doctype html><script>for(let i=0;i<150;i++)fetch("https://burst.example/"+i).catch(()=>{});</script>'});
assert.equal(burst.state,'policy_limited');assert.equal(burst.deniedCount,99);
assert.ok(burst.samples.length<3,'attempt cap must stop rendering, not just truncate diagnostics');
console.log('PASS initial navigation plus 99 denied attempts ends the render');

const moved=await render({url,html:'<!doctype html><script>history.replaceState(null,"","/changed");</script>'});
assert.equal(moved.state,'policy_limited');assert.deepEqual(moved.samples,[]);
console.log('PASS changed navigation context cannot be captured under the original URL');

const rejected=await render({url:'https://www.google.com/',html:'<main>must not render</main>'},{expectedUrl:url});
assert.equal(rejected.state,'failed');assert.deepEqual(rejected.samples,[]);
console.log('PASS non-fixture URL rejected without fabricated DOM');

const hung=await render({url,html:'<!doctype html><script>while(true){}</script>'});
assert.ok(['timeout','failed'].includes(hung.state));assert.deepEqual(hung.samples,[]);
console.log('PASS hung page terminates without fabricated DOM');

await assert.rejects(render({url,html:'<!doctype html><script>while(true){}</script>'},{timeoutMs:500}),/docker_host_timeout/);
console.log('PASS host deadline kills and removes the named worker container');
