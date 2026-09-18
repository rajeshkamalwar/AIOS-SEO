import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {base,hash,validate} from '../packages/contracts/index.js';
import {prepareOfflineRenderInput} from '../packages/perception/render-input.js';
import {parseOfflineRenderResult} from '../packages/perception/render-result.js';
import {buildOfflineRenderManifest} from '../packages/perception/render-manifest.js';
function fixture(html='café'){
 const raw=Buffer.from(html),prepared=prepareOfflineRenderInput(raw,{evidenceId:randomUUID(),sha256:hash(raw),bytes:raw.length,sourceUri:'https://render.example/',contentType:'text/html; charset=utf-8',truncated:false});
 assert.equal(prepared.state,'prepared');if(prepared.state!=='prepared')throw new Error('fixture');
 const context={tenantId:randomUUID(),siteId:randomUUID(),crawlId:randomUUID(),pageSnapshotId:randomUUID(),invocationId:randomUUID(),startedAt:'2026-09-18T00:00:00.000Z',finishedAt:'2026-09-18T00:00:20.000Z',browserBuild:'145.0.0.1'};
 const worker={profile:'local-offline-replay-v3',url:prepared.url,inputSha256:prepared.inputSha256,browserBuild:context.browserBuild,state:'captured',samples:[0,2000,5000].map(offsetMs=>({offsetMs,actualOffsetMs:offsetMs+1,observedAt:new Date(Date.parse(context.startedAt)+offsetMs+1).toISOString(),pendingRequests:offsetMs===0?1:0,dom:'<p>'+html+'</p>'})),deniedCount:0,deniedRequests:[],sandbox:{namespace:true,pid:true,network:true,seccomp:true}};
 const stdout=Buffer.from(JSON.stringify(worker)+'\n');
 const result=parseOfflineRenderResult(stdout,{url:prepared.url,inputSha256:prepared.inputSha256,...context});
 return {prepared,context,stdout,result,receiptEvidenceId:randomUUID(),domEvidenceIds:result.samples.map(()=>randomUUID())};
}
test('Render manifest separates exact DOM artifacts and raw source, transformed input, transport and manifest digests',()=>{
 const input=fixture(),output=buildOfflineRenderManifest(input);
 validate(base+'offline-render-manifest.schema.json',output.manifest);
 assert.deepEqual(JSON.parse(output.manifestBytes.toString('utf8')),output.manifest);
 assert.equal(output.manifest.transport.sha256,hash(input.stdout));assert.equal(output.manifest.transport.retained,false);
 assert.notEqual(hash(output.manifestBytes),output.manifest.transport.sha256);
 assert.equal(output.manifest.source.sha256,input.prepared.source.rawSha256);
 assert.equal(output.manifest.preparation.input_sha256,input.prepared.inputSha256);
 for(const [index,artifact] of output.domArtifacts.entries()){
  assert.deepEqual(artifact.bytes,Buffer.from(input.result.samples[index]!.dom));
  assert.equal(artifact.sha256,hash(artifact.bytes));assert.equal(artifact.evidenceId,input.domEvidenceIds[index]);
  const {dom,...measured}=input.result.samples[index]!;
  assert.deepEqual(output.manifest.worker.samples[index],{...measured,evidence_id:artifact.evidenceId,sha256:artifact.sha256,bytes:artifact.bytes.length});
 }
 assert.equal(output.manifest.worker.samples[0]!.pendingRequests,1);
 assert.equal(output.manifestBytes.includes(Buffer.from('café')),false);
 assert.deepEqual(buildOfflineRenderManifest(input),output);
});
test('Render manifest accepts large stdout while retaining bounded independent DOMs and compact metadata',()=>{
 const input=fixture();input.result.samples.forEach(s=>{s.dom='x'.repeat(5242880);});input.stdout=Buffer.from(JSON.stringify(input.result));
 assert.ok(input.stdout.length>5242880);
 const out=buildOfflineRenderManifest(input);assert.equal(out.domArtifacts.length,3);assert.ok(out.manifestBytes.length<65536);
 assert.ok(out.domArtifacts.every(a=>a.bytes.length===5242880));
 input.result.samples[0]!.dom+='x';input.stdout=Buffer.from(JSON.stringify(input.result));assert.throws(()=>buildOfflineRenderManifest(input),/render_result_invalid/);
});
test('Render manifest zero-sample failure retains failure metadata without fake DOM or artifacts',()=>{
 const input=fixture();input.result={...input.result,url:null,inputSha256:null,browserBuild:null,state:'failed',error:'render_failed',samples:[],sandbox:null};input.stdout=Buffer.from(JSON.stringify(input.result));input.domEvidenceIds=[];
 const out=buildOfflineRenderManifest(input);assert.deepEqual(out.domArtifacts,[]);assert.deepEqual(out.manifest.worker.samples,[]);assert.equal(out.manifest.worker.error,'render_failed');
 assert.equal(out.manifest.source.evidence_id,input.prepared.source.evidenceId);
});
test('Render manifest rejects substitution, unbound prepared context and duplicate or missing assigned identities',()=>{
 const input=fixture();
 assert.throws(()=>buildOfflineRenderManifest({...input,stdout:Buffer.from(JSON.stringify({...input.result,browserBuild:'wrong'}))}),/render_result_invalid/);
 assert.throws(()=>buildOfflineRenderManifest({...input,result:{...input.result,samples:input.result.samples.map(s=>({...s,dom:'changed'}))}}),/artifact_integrity_failed/);
 for(const prepared of [{...input.prepared,html:'changed'},{...input.prepared,inputBytes:1},{...input.prepared,inputSha256:'0'.repeat(64)}])assert.throws(()=>buildOfflineRenderManifest({...input,prepared}),/artifact_integrity_failed/);
 for(const domEvidenceIds of [[],[input.receiptEvidenceId,...input.domEvidenceIds.slice(1)],[input.prepared.source.evidenceId,...input.domEvidenceIds.slice(1)],[input.domEvidenceIds[0]!,input.domEvidenceIds[0]!,input.domEvidenceIds[2]!]])assert.throws(()=>buildOfflineRenderManifest({...input,domEvidenceIds}),/schema_invalid/);
 assert.throws(()=>buildOfflineRenderManifest({...input,receiptEvidenceId:'invalid'}),/schema_invalid/);
 assert.throws(()=>buildOfflineRenderManifest({...input,context:{...input.context,finishedAt:input.context.startedAt}}),/render_result_invalid/);
});
test('Render manifest schema is closed at every nested artifact and authority boundary',()=>{
 const manifest=buildOfflineRenderManifest(fixture()).manifest;
 const mutations=[{...manifest,website_write:true},{...manifest,extra:true},{...manifest,source:{...manifest.source,html:'hidden'}},{...manifest,invocation:{...manifest.invocation,authority:'live'}},{...manifest,transport:{...manifest.transport,retained:true}},{...manifest,worker:{...manifest.worker,samples:manifest.worker.samples.map(s=>({...s,dom:'embedded'}))}},{...manifest,preparation:{...manifest.preparation,version:'unversioned'}}];
 for(const invalid of mutations)assert.throws(()=>validate(base+'offline-render-manifest.schema.json',invalid),/schema_invalid/);
});
