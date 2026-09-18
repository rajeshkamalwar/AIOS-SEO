import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {hash,base,validate} from '../packages/contracts/index.js';
import {prepareOfflineRenderInput} from '../packages/perception/render-input.js';
import {parseOfflineRenderResult} from '../packages/perception/render-result.js';
import {buildRetainedOfflineRenderManifest} from '../packages/perception/render-retention.js';
function fixture(){
 const raw=Buffer.from('<main>Business</main>');
 const prepared=prepareOfflineRenderInput(raw,{evidenceId:randomUUID(),sha256:hash(raw),bytes:raw.length,sourceUri:'https://retain.example/?campaign=hidden-query',contentType:'text/html; charset=utf-8',truncated:false});
 if(prepared.state!=='prepared')throw new Error('fixture');
 const context={tenantId:randomUUID(),siteId:randomUUID(),crawlId:randomUUID(),pageSnapshotId:randomUUID(),invocationId:randomUUID(),startedAt:'2026-09-18T00:00:00.000Z',finishedAt:'2026-09-18T00:00:20.000Z',browserBuild:'145.0.0.1'};
 const worker={profile:'local-offline-replay-v3',url:prepared.url,inputSha256:prepared.inputSha256,browserBuild:context.browserBuild,state:'policy_limited',samples:[{offsetMs:0,actualOffsetMs:1,observedAt:'2026-09-18T00:00:00.001Z',pendingRequests:0,dom:'<main>Business<form><textarea>FORM_SENTINEL</textarea></form><script>const token="SCRIPT_SENTINEL"</script></main>'}],deniedCount:1,deniedRequests:[{url:'https://x.example/?token=URL_SENTINEL',method:'SECRET_METHOD',resourceType:'fetch',reason:'offline_policy',observedAt:'2026-09-18T00:00:00.001Z'}],sandbox:{namespace:true,pid:true,network:true,seccomp:true}};
 const stdout=Buffer.from(JSON.stringify(worker));
 return {prepared,context,stdout,result:parseOfflineRenderResult(stdout,{url:prepared.url,inputSha256:prepared.inputSha256,...context}),receiptEvidenceId:randomUUID(),domEvidenceIds:[randomUUID()]};
}
test('Retention separates transient source hashes from privacy-limited artifacts and withholds diagnostic URLs',async()=>{
 const input=fixture(),out=await buildRetainedOfflineRenderManifest(input);
 const retained=Buffer.concat([out.manifestBytes,...out.domArtifacts.map(x=>x.bytes)]).toString();
 for(const secret of ['FORM_SENTINEL','SCRIPT_SENTINEL','URL_SENTINEL','SECRET_METHOD','hidden-query'])assert.equal(retained.includes(secret),false,secret);
 assert.equal(out.manifest.coverage,'privacy_limited');assert.equal(out.manifest.redaction_version,'render-privacy-v1');
 assert.equal(out.manifest.transport.sha256,hash(input.stdout));assert.equal(out.manifest.transport.retained,false);
 assert.equal(out.manifest.worker.samples[0]!.original_sha256,hash(Buffer.from(input.result.samples[0]!.dom)));
 assert.equal(out.manifest.worker.samples[0]!.original_retained,false);
 assert.equal(out.domArtifacts[0]!.sha256,hash(out.domArtifacts[0]!.bytes));
 assert.notEqual(out.domArtifacts[0]!.sha256,out.manifest.worker.samples[0]!.original_sha256);
 assert.equal(out.manifest.worker.deniedRequests[0]!.method,'OTHER');
 assert.deepEqual(await buildRetainedOfflineRenderManifest(input),out);
 validate(base+'offline-render-retained-manifest.schema.json',out.manifest);
});
test('Retention preserves zero-sample failure without an invented DOM and rejects claimed raw retention',async()=>{
 const input=fixture();input.result={...input.result,state:'failed',error:'render_failed',samples:[],deniedCount:0,deniedRequests:[],url:null,inputSha256:null,browserBuild:null,sandbox:null};input.stdout=Buffer.from(JSON.stringify(input.result));input.domEvidenceIds=[];
 const out=await buildRetainedOfflineRenderManifest(input);assert.deepEqual(out.domArtifacts,[]);assert.equal(out.manifest.worker.state,'failed');
 for(const bad of [{...out.manifest,coverage:'complete'},{...out.manifest,transport:{...out.manifest.transport,retained:true}},{...out.manifest,redaction_version:'none-v1'}])assert.throws(()=>validate(base+'offline-render-retained-manifest.schema.json',bad));
});
test('Retention rejects substituted stdout before privacy processing or upload',async()=>{
 const input=fixture();input.stdout=Buffer.from(JSON.stringify({...input.result,inputSha256:'0'.repeat(64)}));
 await assert.rejects(buildRetainedOfflineRenderManifest(input),/render_result_invalid/);
});
test('A single privacy projection budget failure rejects the collection without raw fallback',async()=>{
 const input=fixture();input.result.samples[0]!.dom='<div>'.repeat(140)+'x'+'</div>'.repeat(140);input.stdout=Buffer.from(JSON.stringify(input.result));
 await assert.rejects(buildRetainedOfflineRenderManifest(input),/render_privacy_not_retainable/);
});
test('Retention snapshots original DOM before asynchronous projection starts',async()=>{
 const input=fixture(),originalHash=hash(Buffer.from(input.result.samples[0]!.dom));
 const output=buildRetainedOfflineRenderManifest(input);input.result.samples[0]!.dom='SUBSTITUTED';input.prepared.url='https://changed.example/';
 const retained=await output;assert.equal(retained.manifest.worker.samples[0]!.original_sha256,originalHash);
 assert.equal(retained.manifest.preparation.url,'https://retain.example/');assert.equal(retained.domArtifacts[0]!.bytes.includes(Buffer.from('SUBSTITUTED')),false);
});
