import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseOfflineRenderResult} from '../packages/perception/render-result.js';
const digest=(html:string)=>createHash('sha256').update(Buffer.from(html,'utf8')).digest('hex');
const expected={url:'https://render.example/',browserBuild:'145.0.1.2',inputSha256:digest('<main>fixture</main>')};
const isolation={namespace:true,pid:true,network:true,seccomp:true};
const receipt=()=>({profile:'local-offline-replay-v2',url:expected.url,inputSha256:expected.inputSha256,browserBuild:expected.browserBuild,state:'captured',samples:[0,2000,5000].map(offsetMs=>({offsetMs,actualOffsetMs:offsetMs+1,dom:'<main>'+offsetMs+'</main>'})),deniedCount:0,deniedRequests:[],sandbox:isolation});
const parse=(value:unknown)=>parseOfflineRenderResult(Buffer.from(JSON.stringify(value)),expected);
test('Offline render-result validation preserves exact DOM and actual sample timing without creating evidence',()=>{
 const input=receipt();input.samples[0]!.dom='<main>é &amp; literal</main>';
 const output=parse(input);assert.deepEqual(output,input);assert.equal('evidence_id' in output,false);assert.equal('context_hash' in output,false);
});
test('Offline render-result rejects unknown fields, profile, context substitution and browser build drift',()=>{
 for(const change of [{profile:'production'},{url:'https://other.example/'},{browserBuild:'146.0.0.1'},{evidence_id:'pretend'},{context_hash:'invented'},{extra:true}])assert.throws(()=>parse({...receipt(),...change}),/render_result_invalid/);
 for(const url of ['https://www.google.com/','http://render.example/','https://render.example/?token=secret','https://render.example/admin','https://user:pass@render.example/'])assert.throws(()=>parseOfflineRenderResult(Buffer.from(JSON.stringify(receipt())),{...expected,url}),/render_result_invalid/);
});
test('Offline render-result rejects fabricated success, incomplete or unordered samples and unsafe isolation claims',()=>{
 const input=receipt();
 for(const samples of [[],input.samples.slice(0,2),[input.samples[1],input.samples[0],input.samples[2]],[...input.samples,input.samples[2]],input.samples.map((s,i)=>({...s,offsetMs:i===1?2001:s.offsetMs})),input.samples.map((s,i)=>({...s,actualOffsetMs:i===1?1999:s.actualOffsetMs})),input.samples.map((s,i)=>({...s,actualOffsetMs:i===2?20001:s.actualOffsetMs}))])assert.throws(()=>parse({...input,samples}),/render_result_invalid/);
 for(const sandbox of [null,{...isolation,seccomp:false},{...isolation,secret:true}])assert.throws(()=>parse({...input,sandbox}),/render_result_invalid/);
 assert.throws(()=>parse({...input,browserBuild:null}),/render_result_invalid/);
 assert.throws(()=>parse({...input,samples:input.samples.map(s=>({...s,dom:''}))}),/render_result_invalid/);
});
test('Offline render-result preserves partial and failed receipts without inventing missing samples',()=>{
 const input=receipt();
 const partial=parse({...input,state:'policy_limited',samples:input.samples.slice(0,1)});assert.equal(partial.samples.length,1);
 for(const [state,error] of [['failed','render_failed'],['timeout','timeout']]){
  const failed={...input,url:null,inputSha256:null,browserBuild:null,sandbox:null,state,error,samples:[]};assert.deepEqual(parse(failed),failed);
  assert.throws(()=>parse({...failed,samples:input.samples}),/render_result_invalid/);
 }
 const failedAfterCapture={...input,state:'failed',error:'render_failed',samples:input.samples.slice(0,2)};assert.deepEqual(parse(failedAfterCapture),failedAfterCapture);
 assert.throws(()=>parse({...input,state:'timeout',error:'render_failed'}),/render_result_invalid/);
});
test('Offline render-result v2 requires host-supplied exact input binding including empty HTML',()=>{
 const value=receipt();
 for(const change of [{profile:'local-offline-replay-v1'},{inputSha256:undefined},{inputSha256:null},{inputSha256:'0'.repeat(64)},{inputSha256:value.inputSha256.toUpperCase()}])assert.throws(()=>parse({...value,...change}),/render_result_invalid/);
 assert.throws(()=>parseOfflineRenderResult(Buffer.from(JSON.stringify(value)),{...expected,inputSha256:digest('<main>changed same URL</main>')}),/render_result_invalid/);
 assert.throws(()=>parseOfflineRenderResult(Buffer.from(JSON.stringify(value)),{...expected,inputSha256:''}),/render_result_invalid/);
 const empty=digest('');assert.equal(empty,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
 const emptyResult={...value,inputSha256:empty};assert.deepEqual(parseOfflineRenderResult(Buffer.from(JSON.stringify(emptyResult)),{...expected,inputSha256:empty}),emptyResult);
 const earlyFailure={...value,url:null,inputSha256:null,browserBuild:null,sandbox:null,state:'failed',error:'render_failed',samples:[]};assert.deepEqual(parse(earlyFailure),earlyFailure);
 assert.throws(()=>parse({...earlyFailure,inputSha256:value.inputSha256}),/render_result_invalid/);
 assert.throws(()=>parse({...earlyFailure,url:expected.url}),/render_result_invalid/);
});
test('Offline render-result retains denied attempts as untrusted diagnostics and enforces attempt cap',()=>{
 const deniedRequests=[{url:'http://127.0.0.1/private',method:'POST',resourceType:'fetch',reason:'offline_policy'}];
 const value={...receipt(),state:'policy_limited',deniedCount:1,deniedRequests};assert.deepEqual(parse(value),value);
 for(const change of [{state:'captured'},{deniedCount:0},{deniedCount:100},{deniedCount:2},{deniedRequests:[{...deniedRequests[0],reason:'allowed'}]},{deniedRequests:[{...deniedRequests[0],resourceType:'invented'}]}])assert.throws(()=>parse({...value,...change}),/render_result_invalid/);
 const exhausted={...value,error:'attempt_budget_exhausted',deniedCount:99,deniedRequests:Array.from({length:99},()=>({...deniedRequests[0]}))};assert.deepEqual(parse(exhausted),exhausted);
 assert.throws(()=>parse({...value,error:'attempt_budget_exhausted'}),/render_result_invalid/);
});
test('Offline render-result rejects malformed encoding and bounded-output or DOM overflow',()=>{
 assert.throws(()=>parseOfflineRenderResult(Buffer.from([0xff]),expected),/render_result_invalid/);
 assert.throws(()=>parseOfflineRenderResult(Buffer.from('{} trailing'),expected),/render_result_invalid/);
 assert.throws(()=>parseOfflineRenderResult(Buffer.alloc(20*1024*1024+1),expected),/render_result_invalid/);
 const value=receipt();value.samples[0]!.dom='é'.repeat(2621441);assert.throws(()=>parse(value),/render_result_invalid/);
 value.samples[0]!.dom='\ud800';assert.throws(()=>parse(value),/render_result_invalid/);
 value.samples[0]!.dom='\udc00';assert.throws(()=>parse(value),/render_result_invalid/);
 value.samples[0]!.dom='x'.repeat(5*1024*1024);assert.equal(parse(value).samples[0]!.dom.length,5*1024*1024);
});
