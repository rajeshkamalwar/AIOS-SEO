import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeDocument } from '../packages/perception/decoding.js';

test('declared encodings decode actual bytes without silently replacing errors',()=>{
 const latin=decodeDocument(Buffer.from([0x63,0x61,0x66,0xe9]),'text/html; charset=windows-1252');
 assert.equal(latin.state,'decoded');if(latin.state==='decoded') assert.equal(latin.text,'café');
 assert.equal(decodeDocument(Buffer.from([0xff]),'text/html; charset=utf-8').state,'parse_failed');
});
test('HTML meta prescan determines encoding, with BOM precedence and honest fallback',()=>{
 const meta=Buffer.concat([Buffer.from('<meta charset=windows-1252><p>'),Buffer.from([0xe9])]);
 const result=decodeDocument(meta,'text/html');assert.equal(result.state,'decoded');
 if(result.state==='decoded'){assert.equal(result.encoding,'windows-1252');assert.ok(result.text.endsWith('é'));}
 const bom=decodeDocument(Buffer.from([0xef,0xbb,0xbf,0xc3,0xa9]),'text/html; charset=windows-1252');
 assert.equal(bom.state,'decoded');if(bom.state==='decoded')assert.equal(bom.text,'é');
});
test('unsupported MIME, unknown or conflicting charset and oversized inputs remain explicit',()=>{
 assert.equal(decodeDocument(Buffer.from('body'),'application/pdf').state,'not_applicable');
 assert.equal(decodeDocument(Buffer.from('body'),'text/html; charset=not-real').state,'parse_failed');
 assert.equal(decodeDocument(Buffer.from('body'),'text/html; charset=utf-8; charset=windows-1252').state,'parse_failed');
 assert.equal(decodeDocument(Buffer.alloc(5242881),'text/html').state,'parse_failed');
});
