import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hash } from '../packages/contracts/index.js';
import { extractHtml,type HtmlSource,type HtmlExtraction,type RawSource } from '../packages/perception/dom.js';
function extract(input:string|Buffer,overrides:Partial<HtmlSource>={}){
 const bytes=typeof input==='string'?Buffer.from(input):input;
 return extractHtml(bytes,{evidenceId:randomUUID(),sha256:hash(bytes),responseUrl:'https://example.com/start/page',contentType:'text/html; charset=utf-8',truncated:false,policyLimited:false,...overrides});
}
function parsed(value:HtmlExtraction):Extract<HtmlExtraction,{state:'extracted'}>{assert.equal(value.state,'extracted');return value;}
function slice(bytes:Buffer,source:RawSource){const [,start,end]=source.locator.split(':');return bytes.subarray(Number(start),Number(end));}
test('HTML parser extracts title, canonical, robots declarations and resolved anchors with immutable references',()=>{
 const bytes=Buffer.from('<!doctype html><title>A &amp; B</title><link rel="alternate CANONICAL" href="../canonical"><meta name="robots" content="noindex, follow"><main>Hello <b>world</b><a href="./next?x=1&amp;x=2#part">Next</a></main>');
 const result=parsed(extract(bytes));
 assert.equal(result.titles[0]!.value,'A & B');assert.equal(result.canonicals[0]!.resolved,'https://example.com/canonical');
 assert.equal(result.namedMeta[0]!.name.value,'robots');assert.equal(result.namedMeta[0]!.content.value,'noindex, follow');
 assert.equal(result.anchors[0]!.resolved,'https://example.com/start/next?x=1&x=2#part');
 assert.equal(result.mainText.selection,'explicit_main');assert.equal(result.mainText.text,'Hello world Next');
 assert.equal(slice(bytes,result.canonicals[0]!.source).toString(),'href="../canonical"');
 for(const ref of [result.titles[0]!.source,result.namedMeta[0]!.content.source,...result.mainText.segments.map(s=>s.source)]){
  assert.equal(ref.sha256,hash(bytes));assert.equal(ref.evidence_id,result.source.evidenceId);assert.equal(ref.parser_version,result.parserVersion);assert.ok(slice(bytes,ref).length);
 }
});
test('absent elements, absent attributes and empty declarations remain distinguishable',()=>{
 const absent=parsed(extract('<main>text</main>'));assert.deepEqual(absent.titles,[]);assert.deepEqual(absent.canonicals,[]);
 const present=parsed(extract('<title></title><link rel=canonical><link rel=canonical href=""><meta name=robots><meta name=robots content=""><a>no href</a><a href="">empty</a>'));
 assert.equal(present.titles[0]!.value,'');assert.equal(present.canonicals[0]!.value,null);assert.equal(present.canonicals[0]!.resolved,null);
 assert.equal(present.canonicals[1]!.value,'');assert.equal(present.canonicals[1]!.resolved,'https://example.com/start/page');
 assert.equal(present.namedMeta[0]!.content.value,null);assert.equal(present.namedMeta[1]!.content.value,'');
 assert.equal(present.anchors[0]!.value,null);assert.equal(present.anchors[1]!.value,'');assert.equal(present.absenceClaimsAllowed,false);
});
test('base and canonical targets are observations only, with first-base resolution and no fetch authority',()=>{
 const result=parsed(extract('<base href="https://other.example/area/"><base href="https://ignored.example/"><link rel=canonical href="../canonical"><a href="child">child</a><a href="javascript:alert(1)">untrusted</a><a href="http://127.0.0.1/private">local</a>'));
 assert.equal(result.bases.length,2);assert.equal(result.canonicals[0]!.resolved,'https://other.example/canonical');assert.equal(result.anchors[0]!.resolved,'https://other.example/area/child');
 assert.equal(result.anchors[1]!.resolved,'javascript:alert(1)');assert.equal(result.anchors[2]!.resolved,'http://127.0.0.1/private');
 assert.ok(result.limitations.includes('base_and_link_values_are_observations_not_fetch_authority'));
});
test('scripts, style content, forms and declared hidden text are excluded without claiming computed visibility',()=>{
 const result=parsed(extract('<style>.gone{display:none}</style><main>Public<script>throw new Error("must not execute")</script><style>secret style</style><template>template secret</template><noscript>fallback secret</noscript><div hidden=false>hidden secret</div><span aria-hidden=true>accessibility hidden</span><form><input value="private"><textarea>private textarea</textarea></form><div class=gone>CSS visibility unknown</div></main><footer>footer text</footer>'));
 assert.equal(result.mainText.text,'Public CSS visibility unknown');assert.equal(result.mainText.visibility,'not_observed');assert.equal(result.absenceClaimsAllowed,false);
 assert.ok(result.limitations.includes('computed_css_visibility_not_observed'));
});
test('declared hidden metadata still affects literal title, base, canonical and robots observations',()=>{
 const result=parsed(extract('<head hidden><base aria-hidden=true href="https://other.example/"><title hidden>Title</title><link hidden rel=canonical href="/canonical"><meta hidden name=robots content=noindex></head><body><main hidden>no text</main><a href=next>visible link</a></body>'));
 assert.equal(result.titles[0]!.value,'Title');assert.equal(result.bases[0]!.value,'https://other.example/');assert.equal(result.canonicals[0]!.resolved,'https://other.example/canonical');assert.equal(result.namedMeta[0]!.content.value,'noindex');assert.equal(result.anchors[0]!.resolved,'https://other.example/next');assert.equal(result.mainText.text,'visible link');
});
test('data and javascript bases retain declarations but resolution falls back to response URL',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,content']){
  const result=parsed(extract(`<base href="${value}"><base href="https://ignored.example/"><a href="relative">link</a>`));
  assert.equal(result.bases[0]!.value,value);assert.equal(result.anchors[0]!.resolved,'https://example.com/start/relative');
 }
});
test('malformed HTML is parsed inertly and forged markup inside raw-text nodes is not a declaration',()=>{
 const result=parsed(extract('<!doctype html><script>"<link rel=canonical href=https://fake.example/>"</script><svg><title>foreign title</title><a href="/svg">foreign</a></svg><main><p>one<b>two</p>three<!--<a href=/comment>--><a href="/real" href="/ignored">real'));
 assert.deepEqual(result.canonicals,[]);assert.deepEqual(result.titles,[]);assert.equal(result.anchors.length,1);assert.equal(result.anchors[0]!.resolved,'https://example.com/real');assert.ok(result.parseErrorCount>0);assert.ok(result.mainText.text.includes('one'));
});
test('UTF8 astral characters, entities, BOM and CRLF retain exact original byte offsets',()=>{
 const bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('<!doctype html>\r\n<title>😀 café &amp; tea</title><main>नमस्ते\r\n😀</main><a href="/é">é</a>')]);
 const result=parsed(extract(bytes));assert.equal(slice(bytes,result.titles[0]!.source).toString(),'<title>😀 café &amp; tea</title>');
 assert.equal(slice(bytes,result.anchors[0]!.source).toString(),'href="/é"');
 assert.equal(slice(bytes,result.mainText.segments[0]!.source).toString(),'नमस्ते\r\n😀');
});
test('supported UTF16 and Windows1252 encodings never confuse character indices with byte offsets',()=>{
 const text='\r\n<title>😀 café</title>\r\n<main>body</main>',little=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,'utf16le')]);
 const le=parsed(extract(little,{contentType:'text/html'}));assert.equal(le.encoding,'utf-16le');assert.equal(slice(little,le.titles[0]!.source).toString('utf16le'),'<title>😀 café</title>');
 const big=Buffer.from(little);big.swap16();const be=parsed(extract(big,{contentType:'text/html'}));assert.equal(be.encoding,'utf-16be');const title=Buffer.from(slice(big,be.titles[0]!.source));title.swap16();assert.equal(title.toString('utf16le'),'<title>😀 café</title>');
 const cp=Buffer.from('<title>caf\xe9</title><a href="/next">next</a>','latin1'),win=parsed(extract(cp,{contentType:'text/html; charset=windows-1252'}));
 assert.equal(win.titles[0]!.value,'café');assert.equal(slice(cp,win.anchors[0]!.source).toString(),'href="/next"');
});
test('XML, unsupported locator encodings and malformed decoding abstain instead of fabricating source links',()=>{
 assert.deepEqual(extract('<TITLE>case</TITLE>',{contentType:'application/xhtml+xml'}),{state:'not_extracted',reason:'xml_parser_required'});
 assert.deepEqual(extract(Buffer.from('<title>ascii</title>'),{contentType:'text/html; charset=shift_jis'}),{state:'not_extracted',reason:'locator_encoding_unsupported'});
 assert.deepEqual(extract(Buffer.from([0xc3,0x28])),{state:'not_extracted',reason:'unsupported_or_invalid_encoding'});
 assert.deepEqual(extract('<main/>',{contentType:'application/json'}),{state:'not_extracted',reason:'unsupported_mime'});
});
test('partial or policy-limited source never licenses absence or website failure claims',()=>{
 for(const qualifier of [{truncated:true},{policyLimited:true}]){
  const result=parsed(extract('<main>partial text',qualifier));assert.equal(result.coverage,'partial');assert.equal(result.absenceClaimsAllowed,false);assert.equal(result.mainText.visibility,'not_observed');assert.deepEqual(result.titles,[]);
 }
 assert.throws(()=>extract('<title>changed</title>',{sha256:'0'.repeat(64)}),/artifact_integrity_failed/);
});
test('node and extraction budgets do not silently return incomplete inventories',()=>{
 assert.deepEqual(extract('<a href="/x">x</a>'.repeat(5001)),{state:'not_extracted',reason:'extraction_budget'});
 assert.deepEqual(extract(Buffer.alloc(5242881,65)),{state:'not_extracted',reason:'input_budget'});
});


test('base resolution includes connected HTML metadata inside text-excluded and foreign ancestors',()=>{
 for(const html of [
  '<form><base href="https://other.example/form/"></form><a href="child">child</a>',
  '<svg><foreignObject><base href="https://other.example/form/"></foreignObject></svg><a href="child">child</a>',
 ]) {
  const result=parsed(extract(html));
  assert.equal(result.bases.length,1);assert.equal(result.anchors[0]!.resolved,'https://other.example/form/child');
 }
 const inert=parsed(extract('<template><base href="https://ignored.example/"></template><a href="child">child</a>'));
 assert.deepEqual(inert.bases,[]);assert.equal(inert.anchors[0]!.resolved,'https://example.com/start/child');
});
