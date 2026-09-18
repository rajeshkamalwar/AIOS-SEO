import { createHash } from 'node:crypto';
import { collectPublicHop } from './collector.js';
import { requestPinned } from './transport.js';
import { normalizeUrl } from './url.js';

// Trusted fixed-code fixture worker, not an OS sandbox or public-network worker.
// No database credentials, environment configuration or caller-selected code.
const maximumInput=8192;
let input=Buffer.alloc(0),received=false;
const exitTimer=setTimeout(()=>process.exit(2),25000);
process.stdin.on('data',(chunk:Buffer)=>{
 if(input.length+chunk.length>maximumInput)process.exit(2);
 input=Buffer.concat([input,chunk]);
});
process.stdin.on('error',()=>process.exit(2));
process.stdin.on('end',()=>{void run();});
// macOS may inject this native runtime key even when spawn receives env:{}.
// Discard it; no environment value is forwarded to the collector or reported.
delete process.env.__CF_USER_TEXT_ENCODING;
// The fixed launch contract forwards no ambient environment, including preloads.
if(Object.keys(process.env).length)process.exit(2);
process.stdout.write('READY\n');
async function run(){
 if(received)return;received=true;
 try {
  const task=JSON.parse(input.toString('utf8')) as Record<string,unknown>;
  if(Object.keys(task).sort().join(',')!=='fixturePort,maxDecodedBytes,timeoutMs,url'||typeof task.url!=='string'||!Number.isSafeInteger(task.fixturePort)||Number(task.fixturePort)<1||Number(task.fixturePort)>65535||!Number.isSafeInteger(task.maxDecodedBytes)||Number(task.maxDecodedBytes)<1||Number(task.maxDecodedBytes)>5242880||!Number.isSafeInteger(task.timeoutMs)||Number(task.timeoutMs)<1||Number(task.timeoutMs)>20000)throw new Error('fixture_input');
  const normalized=normalizeUrl(task.url),url=new URL(task.url);
  if(normalized.excluded||normalized.url!==task.url||!url.hostname.endsWith('.example')||url.pathname!=='/robots.txt'||url.search)throw new Error('fixture_input');
  const receipt=await collectPublicHop(task.url,{
   maxBytes:Number(task.maxDecodedBytes),timeoutMs:Number(task.timeoutMs),
   // Explicit synthetic resolution only satisfies collector validation in this
   // fixture. Transport below ignores that address and cannot resolve DNS.
   lookupAll:async()=>[{address:'93.184.216.34',family:4}],
   transport:async(_logical,_address,limits)=>requestPinned(new URL(`http://127.0.0.1:${task.fixturePort}/robots.txt`),{address:'127.0.0.1',family:4},limits),
  });
  process.stdout.write(JSON.stringify({kind:'result',status:receipt.status,truncated:receipt.truncated,retainedBodyBytes:receipt.body?.length??0,retainedBodySha256:receipt.body?createHash('sha256').update(receipt.body).digest('hex'):null})+'\n');
  clearTimeout(exitTimer);
 }catch{
  // Never reflect a URL, remote bytes, secrets or raw exception into diagnostics.
  process.stdout.write('{"kind":"failed"}\n');clearTimeout(exitTimer);process.exitCode=1;
 }
}
