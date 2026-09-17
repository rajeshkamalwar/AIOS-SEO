import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
