import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { base, validate } from "../packages/contracts/index.js";
import { ReadOnlyApi, emptyUnderstanding, type ReadOnlyStore } from "../packages/api/index.js";
const p={tenantId:randomUUID(),userId:randomUUID()}; const site=randomUUID(),run=randomUUID();
const store:ReadOnlyStore={
 async submit(){return {run_id:run,site_id:site}},
 async run(){return {run_id:run,site_id:site,state:"queued",stage:"validating",coverage:{status:"unknown",requested:0,observed:0,failed:0,excluded:0,deferred:0,denominator:"unknown_population",reason:"pending"},watermark:null,error:null}},
 async understanding(){return emptyUnderstanding(site)}, async graph(){const now=new Date().toISOString();return {site_id:site,watermark:0,known_at:now,valid_at:now,view:"client",nodes:[],edges:[],truncated:false,next_cursor:null}}, async cancel(){}
};
const api=new ReadOnlyApi(store,"csrf");
test("M5 authenticated submit and reopen preserve honest unknown sources",async()=>{assert.equal((await api.handle({method:"POST",path:"/v1/sites/discovery-runs",body:{url:"https://orange.example/",idempotency_key:"0123456789abcdef"},principal:p,csrf:"csrf"})).status,202);const reopened=await api.handle({method:"GET",path:`/v1/discovery-runs/${run}`,principal:p});assert.equal(reopened.status,200);const u=await api.handle({method:"GET",path:`/v1/sites/${site}/understanding`,principal:p});assert.deepEqual((u.body as any).missing_sources,["gsc","analytics","bing","serp","rankings","ai_answers"]);});
test("M5 rejects missing authentication and CSRF-protected commands",async()=>{assert.equal((await api.handle({method:"GET",path:`/v1/discovery-runs/${run}`})).status,401);assert.equal((await api.handle({method:"POST",path:"/v1/sites/discovery-runs",principal:p,body:{url:"https://orange.example/",idempotency_key:"0123456789abcdef"}})).status,403);});

test("API missing publication returns classified pending with retry guidance",async()=>{
 const missing=new ReadOnlyApi({...store,async understanding(){throw new Error('projection_pending')},async graph(){throw new Error('projection_pending')}},'csrf');
 for(const suffix of ['understanding','graph']){
  const r=await missing.handle({method:'GET',path:`/v1/sites/${site}/${suffix}`,principal:p});
  assert.equal(r.status,503);assert.equal((r.body as any).error.code,'projection_pending');assert.equal(r.headers['retry-after'],'5');
 }
});
test("API errors are schema-shaped, private and do not disclose internal failures",async()=>{
 const broken=new ReadOnlyApi({...store,async run(){throw new Error('database password secret')}},'csrf');
 const r=await broken.handle({method:'GET',path:`/v1/discovery-runs/${run}`,principal:p});
 assert.equal(r.status,500);assert.equal((r.body as any).error.code,'internal_error');assert.ok(!JSON.stringify(r).includes('password'));assert.equal(r.headers['x-request-id'],(r.body as any).request_id);
});
test("API distinguishes invalid submitted schema from invalid stored output",async()=>{
 const input=await api.handle({method:'POST',path:'/v1/sites/discovery-runs',principal:p,csrf:'csrf',body:{tenant_id:p.tenantId}});assert.equal(input.status,400);
 const broken=new ReadOnlyApi({...store,async run(){return {} as any}},'csrf');
 assert.equal((await broken.handle({method:'GET',path:`/v1/discovery-runs/${run}`,principal:p})).status,500);
});
test("API cancellation returns canonical current Run",async()=>{
 const r=await api.handle({method:'POST',path:`/v1/discovery-runs/${run}/cancel`,principal:p,csrf:'csrf'});
 assert.equal(r.status,202);assert.equal((r.body as any).state,'queued');assert.ok(!('status' in (r.body as any)));
});

test('API error allowlist hides foreign existence and enforces status mapping',async()=>{
 for(const [message,status,code] of [['scope_denied',404,'scope_denied'],['not_found',404,'scope_denied'],['deleted_scope',404,'scope_denied'],['conflict',409,'conflict'],['admission_limited',429,'budget_exhausted'],['policy_unavailable',503,'policy_blocked'],['forbidden_destination',422,'forbidden_destination']] as const){
  const instance=new ReadOnlyApi({...store,async run(){throw new Error(message)}},'csrf');
  const result=await instance.handle({method:'GET',path:`/v1/discovery-runs/${run}`,principal:p});
  assert.equal(result.status,status);assert.equal((result.body as any).error.code,code);assert.deepEqual((result.body as any).error.evidence_ids,[]);
 }
});
test('API replay returns advanced current run and cancellation remains explicit',async()=>{
 const instance=new ReadOnlyApi({...store,async submit(){return {run_id:run,site_id:site,replayed:true}},async run(){return {...await store.run(p,run),state:'cancelled'}}},'csrf');
 const result=await instance.handle({method:'POST',path:'/v1/sites/discovery-runs',body:{url:'https://orange.example/',idempotency_key:'0123456789abcdef'},principal:p,csrf:'csrf'});
 assert.equal(result.status,200);assert.equal((result.body as any).state,'cancelled');
});
test('API UTF8 input budgets reject oversized commands before store work',async()=>{
 let calls=0;const instance=new ReadOnlyApi({...store,async submit(){calls++;return {run_id:run,site_id:site}}},'csrf');
 const result=await instance.handle({method:'POST',path:'/v1/sites/discovery-runs',body:{url:'https://orange.example/'+ '😀'.repeat(4090),idempotency_key:'0123456789abcdef'},principal:p,csrf:'csrf'});
 assert.equal(result.status,400);assert.equal(calls,0);
});
test('API oversized schema-valid graph cannot be delivered',async()=>{
 const graph=await store.graph(p,site,{}) as any;
 graph.nodes=Array.from({length:200},()=>({id:randomUUID(),type:'page',label:'x'.repeat(4096),basis:'observed',support:{source_applicability:'applicable',integrity:'verified',coverage:'partial',identity:'provisional',inference:'deterministic',reasons:['x'.repeat(4096),'y'.repeat(4096)]},evidence_ids:[]}));
 validate(base+'graph.schema.json',graph);
 const instance=new ReadOnlyApi({...store,async graph(){return graph}},'csrf');
 const result=await instance.handle({method:'GET',path:`/v1/sites/${site}/graph`,principal:p});
 assert.equal(result.status,503);assert.equal((result.body as any).error.code,'response_too_large');assert.ok(Buffer.byteLength(JSON.stringify(result.body))<2097152);
});

test('API invalid resource IDs and oversized cancellation never reach store',async()=>{
 let calls=0;const instance=new ReadOnlyApi({...store,async run(){calls++;return store.run(p,run)},async cancel(){calls++}},'csrf');
 for(const path of ['/v1/discovery-runs/abc','/v1/sites/abc/understanding','/v1/sites/abc/graph'])assert.equal((await instance.handle({method:'GET',path,principal:p})).status,400);
 assert.equal((await instance.handle({method:'POST',path:`/v1/discovery-runs/${run}/cancel`,principal:p,csrf:'csrf',body:{x:'😀'.repeat(5000)}})).status,400);
 assert.equal(calls,0);
});

test('API canonical URL admission rejects forbidden actions and credentials before submission',async()=>{
 let calls=0;const instance=new ReadOnlyApi({...store,async submit(){calls++;return {run_id:run,site_id:site}}},'csrf');
 for(const url of ['https://orange.example/logout','https://orange.example/?token=secret','https://127.0.0.1/','https://u:p@orange.example/']){
  const r=await instance.handle({method:'POST',path:'/v1/sites/discovery-runs',principal:p,csrf:'csrf',body:{url,idempotency_key:'0123456789abcdef'}});
  assert.equal(r.status,422);assert.equal((r.body as any).error.code,'forbidden_destination');
 }
 assert.equal(calls,0);
});
