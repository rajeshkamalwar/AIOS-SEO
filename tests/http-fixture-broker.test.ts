import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {once} from 'node:events';
import {gzipSync} from 'node:zlib';
import {hash} from '../packages/contracts/index.js';
import {runHttpFixtureBroker,runHttpFixtureBrokerCaptured} from '../packages/perception/http-fixture-broker.js';
import {requestPinnedObserved} from '../packages/perception/transport.js';
async function fixture(handler:(req:IncomingMessage,res:ServerResponse)=>void){
 const server=createServer(handler);let requests=0;const sockets=new Set<import('node:net').Socket>();server.on('request',()=>requests++);server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as import('node:net').AddressInfo).port;
 return{server,port,requests:()=>requests,async close(){for(const socket of sockets)socket.destroy();server.close();await once(server,'close');}};
}
const input=(port:number,maxDecodedBytes=1024)=>({url:'https://broker.example/robots.txt',fixturePort:port,maxDecodedBytes,timeoutMs:1000});
const gate={beforeRequest:async()=>{}};
test('Host broker returns only bounded observed metadata after one fixed fixture request',async()=>{
 let path='',host='',method='';const f=await fixture((req,res)=>{path=req.url!;host=req.headers.host!;method=req.method!;res.setHeader('Content-Type','text/plain');res.setHeader('Set-Cookie','PRIVATE_COOKIE');res.end('User-agent: *\nAllow: /\n');});
 try{let checks=0;const result=await runHttpFixtureBroker(input(f.port),{beforeRequest:async()=>{checks++;assert.equal(f.requests(),0);}});assert.equal(checks,1);assert.equal(f.requests(),1);assert.equal(path,'/robots.txt');assert.equal(host,'127.0.0.1:'+f.port);assert.equal(method,'GET');assert.equal(result.error,null);assert.equal(result.result?.retainedBodySha256,hash(Buffer.from('User-agent: *\nAllow: /\n')));assert.match(result.closedAt,/Z$/);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_COOKIE|User-agent|Allow:/);}finally{await f.close();}
});
test('Validation, current authority denial and abort before request open no socket',async()=>{
 const f=await fixture((_req,res)=>res.end('unexpected'));try{
 for(const url of ['https://real.test/robots.txt','https://broker.example/private','https://broker.example/robots.txt?key=secret','https://broker.example/robots.txt#fragment','https://user:pass@broker.example/robots.txt'])await assert.rejects(runHttpFixtureBroker({...input(f.port),url},gate));
 await assert.rejects(runHttpFixtureBroker(input(f.port),{beforeRequest:async()=>{throw new Error('skill_revoked');}}),/skill_revoked/);
 const controller=new AbortController();await assert.rejects(runHttpFixtureBroker(input(f.port),{signal:controller.signal,beforeRequest:async()=>controller.abort()}),/aborted/);assert.equal(f.requests(),0);
 }finally{await f.close();}
});
test('Async authority checks cannot replace the previously validated fixture destination',async()=>{
 const a=await fixture((_req,res)=>{res.setHeader('Content-Type','text/plain');res.end('first');}),b=await fixture((_req,res)=>res.end('wrong'));
 try{const task=input(a.port);const result=await runHttpFixtureBroker(task,{beforeRequest:async()=>{task.fixturePort=b.port;}});assert.equal(result.result?.retainedBodySha256,hash(Buffer.from('first')));assert.equal(a.requests(),1);assert.equal(b.requests(),0);}finally{await a.close();await b.close();}
});
test('Redirects and unsupported binary MIME remain metadata-only and never trigger another request',async()=>{
 for(const kind of ['redirect','binary']){const f=await fixture((_req,res)=>{res.statusCode=kind==='redirect'?302:200;res.setHeader('Location','http://127.0.0.1/private');res.setHeader('Content-Type',kind==='redirect'?'text/plain':'application/octet-stream');res.end('SECRET_BODY');});try{const result=await runHttpFixtureBroker(input(f.port),gate);assert.equal(result.result?.status,kind==='redirect'?302:200);assert.equal(result.result?.retainedBodyBytes,0);assert.equal(result.result?.retainedBodySha256,null);assert.equal(f.requests(),1);}finally{await f.close();}}
});
test('Decoded overflow and compressed input retain bounded prefix only',async()=>{
 for(const compressed of [false,true]){const f=await fixture((_req,res)=>{res.setHeader('Content-Type','text/plain');if(compressed)res.setHeader('Content-Encoding','gzip');res.end(compressed?gzipSync('x'.repeat(1000)):'x'.repeat(1000));});try{const result=await runHttpFixtureBroker(input(f.port,40),gate);assert.equal(result.result?.truncated,true);assert.ok(result.result!.retainedBodyBytes<=40);assert.equal(result.result?.retainedBodySha256,hash(Buffer.from('x'.repeat(40))));}finally{await f.close();}}
});
test('Timeout, cancellation and malformed compression report honest errors after closing owned transport',async()=>{
 for(const kind of ['timeout','abort','decode']){const controller=new AbortController();const f=await fixture((_req,res)=>{if(kind==='abort')controller.abort();if(kind==='decode'){res.setHeader('Content-Type','text/plain');res.setHeader('Content-Encoding','gzip');res.end('not gzip');}});try{const result=await runHttpFixtureBroker({...input(f.port),timeoutMs:40},{signal:controller.signal,...gate});assert.equal(result.result,null);assert.equal(result.error,kind==='abort'?'aborted':kind==='decode'?'transport_failed':'collector_timeout');assert.match(result.closedAt,/Z$/);assert.equal(f.requests(),1);}finally{await f.close();}}
});
test('Observed transport hook captures actual request and socket close independently of response settlement',async()=>{
 const f=await fixture((_req,res)=>{res.setHeader('Content-Type','text/plain');res.end('bounded');});let requestClosed=false,socketClosed=false;const closed:Promise<unknown>[]=[];
 try{await requestPinnedObserved(new URL(`http://127.0.0.1:${f.port}/robots.txt`),{address:'127.0.0.1',family:4},{maxBytes:20,timeoutMs:1000},req=>{closed.push(new Promise(resolve=>req.once('close',()=>{requestClosed=true;resolve(undefined);})));req.once('socket',socket=>closed.push(new Promise(resolve=>socket.once('close',()=>{socketClosed=true;resolve(undefined);}))))});await Promise.all(closed);assert.equal(requestClosed,true);assert.equal(socketClosed,true);}finally{await f.close();}
});

test('Private broker capture preserves exact observed bytes and logical fixture metadata without exposing it publicly',async()=>{
 const body=Buffer.from('User-agent: *\nAllow: /\n');let actualHost='';
 const f=await fixture((req,res)=>{actualHost=req.headers.host!;res.statusCode=404;res.setHeader('Content-Type','text/plain');res.setHeader('Set-Cookie','PRIVATE_COOKIE');res.end(body);});
 try{const before=Date.now(),captured=await runHttpFixtureBrokerCaptured(input(f.port),gate);
  assert.equal(actualHost,'127.0.0.1:'+f.port);assert.deepEqual(captured.capture.body,body);assert.equal(captured.capture.result.url,'https://broker.example/robots.txt');
  assert.equal(captured.capture.result.status_code,404);assert.equal(captured.capture.result.error,null);assert.ok(captured.capture.result.headers.some(h=>h.name==='content-type'&&h.value==='text/plain'));
  assert.doesNotMatch(JSON.stringify(captured.capture.result),/PRIVATE_COOKIE|127\.0\.0\.1/);assert.equal(captured.receipt.result?.retainedBodySha256,hash(body));
  assert.ok(Date.parse(captured.capture.observedAt)>=before&&Date.parse(captured.capture.observedAt)<=Date.parse(captured.receipt.closedAt));
  const publicResult=await runHttpFixtureBroker(input(f.port),gate);assert.deepEqual(Object.keys(publicResult).sort(),['closedAt','error','result']);assert.doesNotMatch(JSON.stringify(publicResult),/User-agent|headers|observedAt/);
 }finally{await f.close();}
});
test('Private transport failure capture has no invented status, headers or body',async()=>{
 const f=await fixture((_req,res)=>res.destroy());try{const {capture,receipt}=await runHttpFixtureBrokerCaptured(input(f.port),gate);
  assert.equal(capture.body,null);assert.equal(capture.result.status_code,null);assert.deepEqual(capture.result.headers,[]);assert.equal(receipt.result,null);
  assert.deepEqual(capture.result.error,{code:'source_unavailable',retryable:true,detail:'fixture transport failed',evidence_ids:[]});
 }finally{await f.close();}
});
