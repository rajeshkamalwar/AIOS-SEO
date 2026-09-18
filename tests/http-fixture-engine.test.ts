import test from 'node:test';
import assert from 'node:assert/strict';
import {DockerHttpFixtureEngine,HttpFixtureProtocol,parseHttpFixtureResult,type HttpFixtureMetadata} from '../packages/jobs/docker-http-fixture.js';
const metadata:HttpFixtureMetadata={status:200,truncated:false,retainedBodyBytes:3,retainedBodySha256:'a'.repeat(64)};
const request='{"kind":"fetch"}\n',result=JSON.stringify({kind:'result',metadata})+'\n';
function protocol(onRequest:()=>Promise<HttpFixtureMetadata>=async()=>metadata){let calls=0,failed=0;const written:string[]=[];const value=new HttpFixtureProtocol(async()=>{calls++;return onRequest();},line=>written.push(line),()=>{failed++;});return {value,written,get calls(){return calls;},get failed(){return failed;}};}
test('Fixed HTTP engine configuration accepts only immutable image identity and bounded context',()=>{
 assert.doesNotThrow(()=>new DockerHttpFixtureEngine({imageDigest:'a'.repeat(64)}));
 for(const config of [{imageDigest:'latest'},{imageDigest:'a'.repeat(64),dockerContext:'--host=host'},{imageDigest:'a'.repeat(64),command:'curl'},{imageDigest:'a'.repeat(64),env:{SECRET:'x'}}])assert.throws(()=>new DockerHttpFixtureEngine(config as any),/invalid_engine_config/);
});
test('One bounded closed fetch invokes only the trusted callback and result is strict metadata',async()=>{
 const p=protocol();p.value.feed(Buffer.from(request.slice(0,5)));p.value.feed(Buffer.from(request.slice(5)));await p.value.pending;
 assert.equal(p.calls,1);assert.equal(p.failed,0);assert.deepEqual(JSON.parse(p.written[0]!),{kind:'response',metadata});p.value.feed(Buffer.from(result));assert.equal(p.value.end(),true);
 assert.deepEqual(parseHttpFixtureResult(Buffer.from(request+result),3),metadata);assert.equal(parseHttpFixtureResult(Buffer.from(request+result),2),null);
});
test('Worker cannot smuggle a URL, header, second request or premature result into a capability',async()=>{
 for(const bad of ['{"kind":"fetch","url":"http://169.254.169.254/"}\n','{"kind":"fetch","headers":{}}\n','{"kind":"fetch","kind":"fetch"}\n',' {"kind":"fetch"}\n','{"kind":"fetch"}\r\n','[]\n',request+request,request+result]){
  const p=protocol();p.value.feed(Buffer.from(bad));await p.value.pending;assert.equal(p.calls,0,bad);assert.equal(p.failed,1);assert.equal(p.value.end(),false);
 }
 const p=protocol();p.value.feed(Buffer.from(request));await p.value.pending;p.value.feed(Buffer.from(request));assert.equal(p.calls,1);assert.equal(p.failed,1);
});
test('Oversized, incomplete and invalid UTF8 protocol frames fail closed without dispatch',async()=>{
 for(const bad of [Buffer.alloc(4097,120),Buffer.from('{"kind":"fetch"}'),Buffer.from([0xff,10])]){const p=protocol();p.value.feed(bad);assert.equal(p.value.end(),false);await p.value.pending;assert.equal(p.calls,0);assert.equal(p.failed,1);}
});
test('Broker rejection and malformed metadata never become a worker response or successful transcript',async()=>{
 for(const get of [async()=>{throw new Error('private diagnostics');},async()=>({...metadata,secret:'not forwarded'}),async()=>({...metadata,status:null}),async()=>({...metadata,retainedBodyBytes:5242881})]){
  const p=protocol(get as ()=>Promise<HttpFixtureMetadata>);p.value.feed(Buffer.from(request));await p.value.pending;assert.equal(p.calls,1);assert.equal(p.failed,1);assert.deepEqual(p.written,[]);assert.equal(p.value.end(),false);
 }
});
test('Protocol tail and forged metadata never parse as an authorized result',()=>{
 for(const text of [result,request+result+request,request+result+'x',request+JSON.stringify({kind:'result',metadata:{...metadata,url:'http://private/'}})+'\n',request+JSON.stringify({kind:'result',metadata:{...metadata,status:600}})+'\n',request+result.replace('"status":200','"status":200,"status":200')])assert.equal(parseHttpFixtureResult(Buffer.from(text),5242880),null);
});
