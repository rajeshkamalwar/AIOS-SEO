import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../packages/contracts/index.js';
import {projectRenderDomPrivacy} from '../packages/perception/render-privacy.js';
import {projectRenderDomPrivacyIsolated} from '../packages/perception/render-privacy-isolated.js';
function projected(input:string){const result=projectRenderDomPrivacy(input);assert.equal(result.state,'projected');if(result.state!=='projected')throw new Error('not_projected');return result;}
test('Privacy projection preserves semantic text and bounded SEO metadata with separate truthful digests',()=>{
 const raw='<title>Café 🌍</title><link rel="canonical" href="https://example.test/page"><meta name="robots" content="noindex, follow"><main><h1>Services</h1><p>Useful text</p><a href="/about?secret=bad#private">About</a></main>';
 const result=projected(raw),text=result.bytes.toString();assert.equal(result.originalSha256,hash(Buffer.from(raw)));assert.equal(result.sha256,hash(result.bytes));assert.notEqual(result.sha256,result.originalSha256);assert.equal(result.redactionVersion,'render-privacy-v1');assert.match(text,/<title>Café 🌍<\/title>/);assert.match(text,/href="https:\/\/example.test\/page"/);assert.match(text,/content="noindex, follow"/);assert.match(text,/<a>About<\/a>/);assert.doesNotMatch(text,/secret|private|token=/);assert.ok(result.limitations.includes('no_arbitrary_secret_detection'));
});
test('Forms, detached controls, form-associated and editable subtrees are withheld completely',()=>{
 const result=projected('<form><p>FORM_SECRET</p></form><input value="INPUT_SECRET"><textarea>TEXTAREA_SECRET</textarea><select><option>OPTION_SECRET</option></select><button>BUTTON_SECRET</button><div form="x">ASSOCIATED_SECRET</div><div contenteditable="false">EDITABLE_SECRET</div><div role="textbox">ROLE_SECRET</div><p>Safe</p>');
 assert.doesNotMatch(result.bytes.toString(),/SECRET|form|input|textarea|option|button|editable/);assert.match(result.bytes.toString(),/<p>Safe<\/p>/);
});
test('Executable, foreign, template and embedded payloads and comments never survive projection',()=>{
 const raw='<script>SCRIPT_SECRET</script><style>STYLE_SECRET</style><!--COMMENT_SECRET--><template>TEMPLATE_SECRET</template><iframe>IFRAME_SECRET</iframe><object>OBJECT_SECRET</object><embed src="EMBED_SECRET"><svg><text>SVG_SECRET</text></svg><math><mtext>MATH_SECRET</mtext></math><noscript>NOSCRIPT_SECRET</noscript><custom-node>CUSTOM_SECRET</custom-node><p>Safe</p>';
 assert.doesNotMatch(projected(raw).bytes.toString(),/SECRET|script|style|iframe|object|embed|svg|math|template/);
});
test('Unknown attributes, hidden subtrees and arbitrary metadata do not become retained payload',()=>{
 const output=projected('<p id="ID_SECRET" class="CLASS_SECRET" title="TITLE_SECRET" data-token="DATA_SECRET" onclick="HANDLER_SECRET">Hello</p><p hidden>HIDDEN_SECRET</p><p aria-hidden="true">ARIA_SECRET</p><meta name="customer" content="META_SECRET"><meta name="robots" content="ARBITRARY_SECRET">').bytes.toString();assert.doesNotMatch(output,/SECRET|onclick|data-token|title=/);assert.match(output,/<p>Hello<\/p>/);
});
test('URL attributes reject credentials and active schemes; URL-containing decoded text is withheld',()=>{
 const output=projected('<a href="javascript:alert(1)">JavaScript</a><a href="data:text/plain,secret">Data</a><a href="https://user:pass@example.test/">Userinfo</a><a href="//example.test/page?key=secret">Path</a><p>https&#58;//example.test/private?token=secret</p><p>www.example.test</p><p>example.test/token</p><p>/relative?secret=bad</p><p>10.0.0.1/private</p><p>Normal text</p>').bytes.toString();assert.doesNotMatch(output,/javascript:|data:|user:pass|token|key=|secret|private|<p>www|<p>example/);assert.match(output,/<a>Path<\/a>/);assert.match(output,/<p>Normal text<\/p>/);
});
test('Malformed HTML is inertly repaired and privacy projection is deterministic',()=>{
 const raw='<p><b>Hello</p></b><table><form><input value="SECRET"></form><tr><td>Cell';const a=projected(raw),b=projected(raw);assert.deepEqual(a,b);assert.doesNotMatch(a.bytes.toString(),/SECRET/);assert.equal(projected(a.bytes.toString()).sha256,a.sha256);
});
test('Invalid Unicode and input, node, depth and expanded output budgets fail without raw fallback',()=>{
 assert.deepEqual(projectRenderDomPrivacy('\ud800'),{state:'not_retainable',reason:'invalid_encoding'});assert.deepEqual(projectRenderDomPrivacy('\udfff'),{state:'not_retainable',reason:'invalid_encoding'});
 for(const raw of ['x'.repeat(5242881),'🌍'.repeat(1400000),'<p>x</p>'.repeat(10001),'<div>'.repeat(140)+'x'+'</div>'.repeat(140),'"'.repeat(1100000)])assert.deepEqual(projectRenderDomPrivacy(raw),{state:'not_retainable',reason:'budget_exceeded'});
});
test('Isolated worker preserves exact projected bytes and terminates on deadline while parent remains usable',async()=>{
 const raw='<main><p>Café 🌍</p><form>PRIVATE</form></main>';assert.deepEqual(await projectRenderDomPrivacyIsolated(raw),projectRenderDomPrivacy(raw));
 assert.deepEqual(await projectRenderDomPrivacyIsolated('<div>'.repeat(10000),{timeoutMs:1}),{state:'not_retainable',reason:'budget_exceeded'});
 assert.deepEqual(await projectRenderDomPrivacyIsolated(raw),projectRenderDomPrivacy(raw));
});
test('Isolated adapter bounds inputs before cloning and refuses process heap overrides',async()=>{
 assert.deepEqual(await projectRenderDomPrivacyIsolated('x'.repeat(5242881)),{state:'not_retainable',reason:'budget_exceeded'});assert.deepEqual(await projectRenderDomPrivacyIsolated('\ud800'),{state:'not_retainable',reason:'invalid_encoding'});
 await assert.rejects(projectRenderDomPrivacyIsolated('safe',{timeoutMs:2001}),/invalid_input/);await assert.rejects(projectRenderDomPrivacyIsolated('safe',1 as never),/invalid_input/);
 const prior=process.env.NODE_OPTIONS;try{process.env.NODE_OPTIONS='--max-old-space-size=4096';assert.deepEqual(await projectRenderDomPrivacyIsolated('safe'),{state:'not_retainable',reason:'budget_exceeded'});}finally{if(prior===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=prior;}
});

test('Removed base declarations cannot give relative anchors or canonicals an invented destination',()=>{
 const output=projected('<base href="https://other.example/private/"><link rel="canonical" href="contact"><a href="contact">Contact</a><a href="/root">Root</a><a href="//other.example/path">Protocol relative</a><a href="https://other.example/actual">Absolute</a>').bytes.toString();
 assert.doesNotMatch(output,/<base|rel="canonical"|href="contact"|href="\/root"|href="\/\//);assert.match(output,/<a>Contact<\/a>/);assert.match(output,/href="https:\/\/other.example\/actual"/);
});

test('Query or fragment URL declarations are withheld rather than changed into different identities',()=>{
 const output=projected('<link rel="canonical" href="https://example.test/page?id=1"><link rel="canonical" href="https://example.test/page#part"><a href="https://example.test/page?">Empty query</a><a href="https://example.test/page#">Empty fragment</a><a href="https://example.test/page?token=SECRET">Sensitive</a>').bytes.toString();assert.doesNotMatch(output,/rel="canonical"|href=|SECRET/);assert.match(output,/<a>Sensitive<\/a>/);
});
