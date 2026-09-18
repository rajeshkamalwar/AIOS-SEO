import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { hash } from '../packages/contracts/index.js';
import { extractHtml,type HtmlSource } from '../packages/perception/dom.js';
import { extractHtmlIsolated } from '../packages/perception/dom-isolated.js';

function fixture(bytes:Uint8Array):HtmlSource{return {evidenceId:randomUUID(),sha256:hash(bytes),responseUrl:'https://isolated.example/',contentType:'text/html; charset=utf-8',truncated:false,policyLimited:false};}
const ports=()=>process.getActiveResourcesInfo().filter(name=>name==='MessagePort').length;
test('isolated inert parser returns identical extraction and original byte locators, then terminates',async()=>{
 const bytes=Buffer.from('<title>😀 fixture</title><main>café &amp; tea</main>'),source=fixture(bytes),before=ports();
 assert.deepEqual(await extractHtmlIsolated(bytes,source),extractHtml(bytes,source));
 assert.ok(ports()<=before);
});
test('oversize parser input is rejected before any worker or source parsing',async()=>{
 const bytes=Buffer.alloc(5242881,65),source=fixture(bytes),before=ports();
 assert.deepEqual(await extractHtmlIsolated(bytes,source),{state:'not_extracted',reason:'input_budget'});assert.equal(ports(),before);
});
test('bounded worker deadline rejects late results and parent remains usable afterwards',async()=>{
 const bytes=Buffer.from('<main>'+'<div><b>malformed'.repeat(150000)),source=fixture(bytes),before=ports(),start=performance.now();
 assert.deepEqual(await extractHtmlIsolated(bytes,source,{timeoutMs:1}),{state:'not_extracted',reason:'parser_budget'});
 assert.ok(performance.now()-start<2000);assert.ok(ports()<=before);
 const small=Buffer.from('<title>after timeout</title>'),nextSource=fixture(small);assert.deepEqual(await extractHtmlIsolated(small,nextSource),extractHtml(small,nextSource));
});
test('large malformed trees hit worker heap or whole-invocation budget without blocking parent',async()=>{
 const bytes=Buffer.from('<main>'+'<div><b>malformed'.repeat(250000)),source=fixture(bytes),before=ports();let parentProgress=false;
 const timer=setTimeout(()=>{parentProgress=true;},10);
 try{assert.deepEqual(await extractHtmlIsolated(bytes,source),{state:'not_extracted',reason:'parser_budget'});}finally{clearTimeout(timer);}
 assert.equal(parentProgress,true);assert.ok(ports()<=before);
 const small=Buffer.from('<main>still usable</main>');const actual=await extractHtmlIsolated(small,fixture(small));assert.equal(actual.state,'extracted');
});
test('isolation preserves artifact integrity errors and never permits larger execution budgets',async()=>{
 const bytes=Buffer.from('<main>test</main>'),source=fixture(bytes),before=ports();
 await assert.rejects(extractHtmlIsolated(bytes,{...source,sha256:'0'.repeat(64)}),/artifact_integrity_failed/);
 await assert.rejects(extractHtmlIsolated(bytes,source,{timeoutMs:2001}),/parser_limits/);
 assert.ok(ports()<=before);
});
test('unknown or unbounded context is rejected before structured clone or worker creation',async()=>{
 const bytes=Buffer.from('<main>safe</main>'),source=fixture(bytes),before=ports();
 for(const invalid of [null,[],{...source,responseUrl:'a'.repeat(4097)},{...source,contentType:'a'.repeat(4097)},
  {...source,evidenceId:'not-a-uuid'},{...source,policyLimited:'false'},{...source,extra:Buffer.alloc(1000000)}]){
  await assert.rejects(extractHtmlIsolated(bytes,invalid as HtmlSource),/schema_invalid/);
 }
 assert.equal(ports(),before);
});
test('parent NODE_OPTIONS heap overrides fail closed before worker creation',()=>{
 const typescript=import.meta.url.endsWith('.ts');
 const entry=new URL(typescript?'../packages/perception/dom-isolated.ts':'../packages/perception/dom-isolated.js',import.meta.url);
 const script=`import {extractHtmlIsolated} from ${JSON.stringify(entry.href)}; const result=await extractHtmlIsolated(Buffer.from('x'),{evidenceId:'11111111-1111-4111-8111-111111111111',sha256:'0'.repeat(64),responseUrl:'https://fixture.example/',contentType:'text/html',truncated:false,policyLimited:false});process.stdout.write(JSON.stringify(result));`;
 const output=execFileSync(process.execPath,[...(typescript?['--import','tsx']:[]),'--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,NODE_OPTIONS:'--max-old-space-size=256'},timeout:5000});
 assert.deepEqual(JSON.parse(output),{state:'not_extracted',reason:'parser_budget'});
});
test('page scripts remain inert in the budgeted parser',async()=>{
 const bytes=Buffer.from('<script>while(true){}</script><title>not executed</title>'),result=await extractHtmlIsolated(bytes,fixture(bytes));
 assert.equal(result.state,'extracted');if(result.state==='extracted')assert.equal(result.titles[0]!.value,'not executed');
});
