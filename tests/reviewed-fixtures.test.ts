import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertReviewedRawFixture as raw,assertReviewedHttpFixtureMetadata as metadata,assertReviewedFixtureUrl as scopeUrl} from '../packages/perception/reviewed-fixtures.js';
const url='https://receipt.example/';
const check=(text:string,mimeType='text/html',sourceUri=url)=>raw({mimeType,sourceUri,bytes:Buffer.from(text)});
const receipt=()=>({url,final_url:url,method:'GET',status_code:404,headers:[{name:'content-type',value:'text/html; charset=utf-8'}],truncated:false,error:null});
test('reviewed bytes stay exact including original home newline and legacy charset bytes',async()=>{
 const bytes=await readFile('spec/fixtures/home.html');raw({mimeType:'text/html',sourceUri:'https://orange.example/',bytes});
 await assert.rejects(async()=>raw({mimeType:'text/html',sourceUri:'https://orange.example/',bytes:bytes.subarray(0,bytes.length-1)}),/unreviewed_fixture/);
 raw({mimeType:'text/html',sourceUri:url,bytes:Buffer.from('<title>Caf\xe9</title>','latin1')});
 assert.throws(()=>check('<title>Café</title>'),/unreviewed_fixture/);
});
test('unknown HTML and JSON are rejected regardless of secret-pattern appearance',()=>{
 for(const text of ['<h1>Unreviewed innocuous prose</h1>','<!-- secret --><h1>Fixture response</h1>','<h1>Fixture response</h1> ','<form><input value="secret"></form>','<input value="" value="secret">','<script>const key="secret";</script>','<a href="/?token=secret">label</a>'])assert.throws(()=>check(text),/unreviewed_fixture/);
 assert.throws(()=>check('{"fixture":true}','application/json'),/unreviewed_fixture/);
});
test('sitemap templates permit only exact reviewed sequences with same typed origin',()=>{
 const origin='https://12345678-1234-4123-8123-123456789abc.example';
 const body=`<urlset><url><loc>${origin}/services</loc></url></urlset>`;check(body,'application/xml',origin+'/sitemap.xml');
 for(const changed of [body.replace('/services','/secret'),body.replace(origin,'https://other.example'),body.replace('</loc>','</loc><!--secret-->'),body.replace('<url>','<url private="secret">')])assert.throws(()=>check(changed,'application/xml',origin+'/sitemap.xml'),/unreviewed_fixture/);
 assert.throws(()=>check(body,'application/xml','https://unreviewed.example/sitemap.xml'),/unreviewed_fixture/);
});
test('source envelope cannot smuggle query credentials, fragments, ports or opaque path data',()=>{
 for(const source of [url+'?token=secret',url+'#secret',url+'customer-name','https://a:b@receipt.example/','https://receipt.example:443/','https://receipt.example.evil/','http://receipt.example/'])assert.throws(()=>check('fixture','text/html',source),/unreviewed_fixture/);
});
test('HTTP metadata permits exact safe fixture variants and excludes opaque allowed headers',()=>{
 metadata(receipt());metadata({...receipt(),status_code:null,headers:[],error:{code:'timeout',retryable:true,detail:'fixture timeout',evidence_ids:[]}});
 metadata({...receipt(),headers:[{name:'content-type',value:'application/pdf'},{name:'content-length',value:'20'}]});
 for(const header of [{name:'content-type',value:'text/html; token=secret'},{name:'etag',value:'"secret"'},{name:'last-modified',value:'secret'},{name:'x-robots-tag',value:'noindex, secret'},{name:'content-length',value:'0001'}])assert.throws(()=>metadata({...receipt(),headers:[header]}),/unreviewed_fixture/);
 assert.throws(()=>metadata({...receipt(),error:{code:'timeout',retryable:true,detail:'unknown error secret',evidence_ids:[]}}),/unreviewed_fixture/);
});
test('accessors, prototypes, unknown fields and excessive buffers fail closed',()=>{
 let reads=0;const input={mimeType:'text/html',sourceUri:url,get bytes(){reads++;return Buffer.from('fixture');}};
 assert.throws(()=>raw(input),/unreviewed_fixture/);assert.equal(reads,0);
 assert.throws(()=>raw(Object.assign(Object.create({}),{mimeType:'text/html',sourceUri:url,bytes:Buffer.from('fixture')})),/unreviewed_fixture/);
 assert.throws(()=>metadata({...receipt(),extra:'secret'}),/unreviewed_fixture/);
 const headers=[] as unknown[];Object.defineProperty(headers,'0',{get(){reads++;return {name:'content-type',value:'text/html'};},enumerable:true});
 assert.throws(()=>metadata({...receipt(),headers}),/unreviewed_fixture/);assert.equal(reads,0);
 assert.throws(()=>metadata({...receipt(),headers:[...receipt().headers,...receipt().headers]}),/unreviewed_fixture/);
 assert.throws(()=>raw({mimeType:'text/html',sourceUri:url,bytes:Buffer.alloc(5*1024*1024+1)}),/unreviewed_fixture/);
});

test('bounded frontier corpus accepts complete generated fixtures but rejects altered sequence or hidden slots',()=>{
 const origin='https://frontier.example',leaf=(paths:string[])=>'<urlset>'+paths.map(p=>`<url><loc>${origin}${p}</loc></url>`).join('')+'</urlset>';
 const body=leaf([...Array.from({length:25},(_,i)=>`/q?v=${i}`),...Array.from({length:520},(_,i)=>`/p${String(i).padStart(4,'0')}`),'/ordered?a=1&amp;b=2','/ordered?b=2&amp;a=1']);
 check(body,'application/xml',origin+'/sitemap.xml');
 assert.throws(()=>check(body.replace('/p0519','/p0520'),'application/xml',origin+'/sitemap.xml'),/unreviewed_fixture/);
 assert.throws(()=>check(leaf(['/services','/a']),'application/xml',origin+'/sitemap.xml'),/unreviewed_fixture/);
 check('#'.repeat(512001),'text/plain',origin+'/robots.txt');
 assert.throws(()=>check('#'.repeat(512002),'text/plain',origin+'/robots.txt'),/unreviewed_fixture/);
});

test('scope URLs use the same closed corpus and reject ordinary opaque query data',()=>{
 for(const host of ['scope','scope-second','scope-delete','hostile-publication','allowed','denied'])scopeUrl(`https://${host}.example/`);
 for(const url of ['https://scope.example/?note=PRIVATE','https://scope.example/customer-private','https://unknown-customer.example/'])assert.throws(()=>scopeUrl(url),/unreviewed_fixture/);
});

test('Reviewed alternate API fixture identities remain available for idempotency conflict checks',()=>{
 for(const host of ['other-deadline','different-replay'])assert.doesNotThrow(()=>scopeUrl(`https://${host}.example/`));
});

test('trusted broker failure details use an exact bounded vocabulary',()=>{
 for(const [code,retryable,detail] of [['source_unavailable',true,'fixture transport failed'],['cancelled',false,'fixture aborted'],['parse_failed',false,'fixture content encoding unsupported']] as const){
  const error={code,retryable,detail,evidence_ids:[]};metadata({...receipt(),status_code:null,headers:[],error});
  assert.throws(()=>metadata({...receipt(),status_code:null,headers:[],error:{...error,detail:detail+' PRIVATE'}}),/unreviewed_fixture/);
  assert.throws(()=>metadata({...receipt(),status_code:null,headers:[],error:{...error,retryable:!retryable}}),/unreviewed_fixture/);
 }
});
