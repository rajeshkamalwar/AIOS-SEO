import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {prepareOfflineRenderInput} from '../packages/perception/render-input.js';
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const context=(bytes:Uint8Array)=>({evidenceId:randomUUID(),sha256:sha(bytes),bytes:bytes.byteLength,sourceUri:'https://render.example/',contentType:'text/html; charset=utf-8',truncated:false});
test('Replay preparation binds exact retained bytes and carries existing source identity without new authority',()=>{
 const bytes=Buffer.from('<p>café</p>'),source=context(bytes),result=prepareOfflineRenderInput(bytes,source);
 assert.equal(result.state,'prepared');if(result.state!=='prepared')return;
 assert.equal(result.html,bytes.toString('utf8'));assert.equal(result.url,source.sourceUri);
 assert.equal(result.inputSha256,sha(bytes));assert.equal(result.inputBytes,bytes.byteLength);
 assert.deepEqual(result.source,{evidenceId:source.evidenceId,rawSha256:source.sha256,rawBytes:source.bytes,contentType:source.contentType});
 assert.equal(result.encoding,'utf-8');assert.equal(result.decoderVersion,'html-sniff-6/node24-v1');assert.equal(result.transformationVersion,'html-decoded-to-utf8-v1');
 assert.equal('status_code' in result,false);assert.equal(result.profile,'local-offline-replay-v2');
});
test('Replay preparation separates transcoded input digest from source digest and retains encoding declaration',()=>{
 const bytes=Buffer.from([0x63,0x61,0x66,0xe9]),source={...context(bytes),contentType:'text/html; charset=windows-1252'};
 const result=prepareOfflineRenderInput(bytes,source);assert.equal(result.state,'prepared');if(result.state!=='prepared')return;
 assert.equal(result.html,'café');assert.equal(result.encoding,'windows-1252');assert.equal(result.inputBytes,5);
 assert.equal(result.source.rawSha256,sha(bytes));assert.equal(result.inputSha256,sha(Buffer.from('café')));assert.notEqual(result.source.rawSha256,result.inputSha256);
 const bom=Buffer.from([0xef,0xbb,0xbf,0xc3,0xa9]),bound=prepareOfflineRenderInput(bom,{...context(bom),contentType:'text/html; charset=windows-1252'});
 assert.equal(bound.state,'prepared');if(bound.state==='prepared'){assert.equal(bound.encoding,'utf-8');assert.equal(bound.html,'é');assert.notEqual(bound.inputSha256,bound.source.rawSha256);}
});
test('Replay preparation rejects altered bytes, false lengths, invalid IDs and unsafe or noncanonical context',()=>{
 const bytes=Buffer.from('fixture'),source=context(bytes);
 for(const altered of [{sha256:'0'.repeat(64)},{bytes:bytes.length+1}])assert.throws(()=>prepareOfflineRenderInput(bytes,{...source,...altered}),/artifact_integrity_failed/);
 for(const altered of [{bytes:-1},{bytes:0.5},{evidenceId:'fake'},{sha256:source.sha256.toUpperCase()},{truncated:'false'}])assert.throws(()=>prepareOfflineRenderInput(bytes,{...source,...altered} as any),/schema_invalid/);
 for(const sourceUri of ['https://public.com/','http://render.example/','https://render.example:8443/','https://render.example/#fragment','https://render.example','https://u:p@render.example/','https://render.example/?token=hidden','https://render.example/admin','https://render.example./'])assert.throws(()=>prepareOfflineRenderInput(bytes,{...source,sourceUri}),/schema_invalid/);
 assert.throws(()=>prepareOfflineRenderInput(Buffer.from('changed'),source),/artifact_integrity_failed/);
});
test('Replay preparation abstains for partial, XHTML, unsupported MIME and invalid encodings',()=>{
 const bytes=Buffer.from('fixture'),source=context(bytes);
 assert.deepEqual(prepareOfflineRenderInput(bytes,{...source,truncated:true}),{state:'not_prepared',reason:'truncated'});
 for(const contentType of ['application/xhtml+xml','application/pdf','image/png','text/plain'])assert.deepEqual(prepareOfflineRenderInput(bytes,{...source,contentType}),{state:'not_prepared',reason:'unsupported_mime'});
 for(const contentType of ['invalid','text/html; charset=bogus','text/html; charset=utf-8; charset=windows-1252'])assert.equal(prepareOfflineRenderInput(bytes,{...source,contentType}).state,'not_prepared');
 for(const invalid of [Buffer.from([0xff]),Buffer.from([0xed,0xa0,0x80])])assert.deepEqual(prepareOfflineRenderInput(invalid,context(invalid)),{state:'not_prepared',reason:'decoding_failed'});
 const invalidUTF16=Buffer.from([0x00,0xd8]);assert.equal(prepareOfflineRenderInput(invalidUTF16,{...context(invalidUTF16),contentType:'text/html; charset=utf-16le'}).state,'not_prepared');
});
test('Replay preparation bounds both original and expanded UTF-8 bytes and supports exact empty input',()=>{
 const large=Buffer.alloc(5242881,65);assert.deepEqual(prepareOfflineRenderInput(large,context(large)),{state:'not_prepared',reason:'raw_budget'});
 const expanded=Buffer.alloc(2*1024*1024,0x80);assert.deepEqual(prepareOfflineRenderInput(expanded,{...context(expanded),contentType:'text/html; charset=windows-1252'}),{state:'not_prepared',reason:'input_budget'});
 const edge=Buffer.alloc(5242880,65);assert.equal(prepareOfflineRenderInput(edge,context(edge)).state,'prepared');
 const empty=Buffer.alloc(0),result=prepareOfflineRenderInput(empty,context(empty));assert.equal(result.state,'prepared');if(result.state==='prepared'){assert.equal(result.html,'');assert.equal(result.inputBytes,0);assert.equal(result.inputSha256,sha(empty));}
});
