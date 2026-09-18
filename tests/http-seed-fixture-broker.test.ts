import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {once} from 'node:events';
import {hash} from '../packages/contracts/index.js';
import {runHttpSeedFixtureBroker} from '../packages/perception/http-seed-fixture-broker.js';
async function fixture(handler:(req:IncomingMessage,res:ServerResponse)=>void){
 const server=createServer(handler);let requests=0;const sockets=new Set<import('node:net').Socket>();server.on('request',()=>requests++);server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as import('node:net').AddressInfo).port;
 return {port,requests:()=>requests,async close(){for(const s of sockets)s.destroy();server.close();await once(server,'close');}};
}
const input=(port:number)=>({url:'https://receipt.example/services',fixturePort:port,maxDecodedBytes:5242880 as const,timeoutMs:20000 as const});
const gate={beforeRequest:async()=>{}};
test('Seed broker requests exact reviewed path and returns metadata only',async()=>{
 let path='',method='';const f=await fixture((req,res)=>{path=req.url!;method=req.method!;res.setHeader('Content-Type','text/html');res.setHeader('Set-Cookie','PRIVATE');res.end('<h1>Fixture response</h1>');});
 try{const r=await runHttpSeedFixtureBroker(input(f.port),gate);assert.equal(path,'/services');assert.equal(method,'GET');assert.equal(f.requests(),1);assert.equal(r.result?.retainedBodySha256,hash(Buffer.from('<h1>Fixture response</h1>')));assert.match(r.closedAt,/Z$/);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|Fixture response|headers|capture/);}finally{await f.close();}
});
test('Seed broker snapshots exact destination and limits before asynchronous current gates',async()=>{
 const a=await fixture((_req,res)=>{res.setHeader('Content-Type','text/plain');res.end('first');}),b=await fixture((_req,res)=>res.end('wrong'));
 try{const task=input(a.port);const r=await runHttpSeedFixtureBroker(task,{beforeRequest:async()=>{task.url='https://receipt.example/about';task.fixturePort=b.port;Object.assign(task,{maxDecodedBytes:1});}});assert.equal(r.result?.retainedBodySha256,hash(Buffer.from('first')));assert.equal(a.requests(),1);assert.equal(b.requests(),0);}finally{await a.close();await b.close();}
});
test('Seed broker rejects unknown identities, action paths, metadata channels and changed fixed caps before dispatch',async()=>{
 const f=await fixture((_req,res)=>res.end('unexpected'));try{
 for(const url of ['https://receipt.example/services?note=PRIVATE','https://receipt.example/services#fragment','https://receipt.example/login','https://receipt.example/unreviewed','https://outside.test/services','https://user:pass@receipt.example/services','https://receipt.example/%73ervices'])await assert.rejects(runHttpSeedFixtureBroker({...input(f.port),url},gate));
 for(const maxDecodedBytes of [1,5242881])await assert.rejects(runHttpSeedFixtureBroker({...input(f.port),maxDecodedBytes} as any,gate),/invalid_input/);
 await assert.rejects(runHttpSeedFixtureBroker(input(f.port),{beforeRequest:async()=>{throw new Error('robots_context_conflict');}}),/robots_context_conflict/);
 assert.equal(f.requests(),0);
 }finally{await f.close();}
});
test('Seed broker never follows redirects and abort proves owned transport closure',async()=>{
 for(const mode of ['redirect','abort']){const controller=new AbortController();const f=await fixture((_req,res)=>{if(mode==='abort'){controller.abort();return;}res.statusCode=302;res.setHeader('Location','http://127.0.0.1/private');res.end();});try{const r=await runHttpSeedFixtureBroker(input(f.port),{...gate,signal:controller.signal});assert.equal(f.requests(),1);assert.equal(r.result?.status,mode==='redirect'?302:undefined);assert.equal(r.error,mode==='abort'?'aborted':null);assert.match(r.closedAt,/Z$/);}finally{await f.close();}}
});
