import { randomUUID } from "node:crypto";
import { base, validate } from "../contracts/index.js";
import type { Principal } from "../persistence/index.js";
import type { Pool } from "pg";
import { Ledger } from "../persistence/index.js";
import { Jobs } from "../jobs/index.js";
import { DeletionLedger } from "../policy/deletion.js";
import { scope, transaction } from "../persistence/transaction.js";

export type Run = { run_id:string; site_id:string; state:"queued"|"running"|"complete_in_scope"|"partial"|"blocked"|"failed"|"cancelled"; stage:string; coverage:{status:"complete_in_scope"|"partial"|"unknown"|"not_applicable";requested:number;observed:number;failed:number;excluded:number;deferred:number;denominator:"requested_scope"|"unknown_population";reason:string|null}; watermark:number|null; error:null };
export type Understanding = { site_id:string; twin_revision_id:string|null; watermark:number; cards:any[]; coverage:Run["coverage"]; missing_sources:("gsc"|"analytics"|"bing"|"serp"|"rankings"|"ai_answers")[] };
export interface ReadOnlyStore { submit(p:Principal,url:string,key:string):Promise<{run_id:string;site_id:string}>; run(p:Principal,id:string):Promise<Run>; understanding(p:Principal,site:string):Promise<Understanding>; graph(p:Principal,site:string,query:Record<string,string>):Promise<unknown>; cancel(p:Principal,id:string):Promise<void>; }
export type Request = { principal?:Principal; method:string; path:string; body?:unknown; csrf?:string };
export class ReadOnlyApi {
  constructor(private store:ReadOnlyStore, private csrfToken:string) {}
  async handle(req:Request):Promise<{status:number;body:unknown;headers:Record<string,string>}> {
    if (!req.principal) return this.reply(401,{code:"unauthenticated"});
    if (!["GET","POST"].includes(req.method)) return this.reply(405,{code:"method_not_allowed"});
    if (req.method === "POST" && req.csrf !== this.csrfToken) return this.reply(403,{code:"csrf_failed"});
    const runMatch=req.path.match(/^\/v1\/discovery-runs\/([0-9a-f-]+)$/);
    if (req.method === "POST" && req.path === "/v1/sites/discovery-runs") {
      validate(base+"api.schema.json#/$defs/Submit",req.body);
      const b=req.body as {url:string;idempotency_key:string}; const v=await this.store.submit(req.principal,b.url,b.idempotency_key);
      const body={run_id:v.run_id,site_id:v.site_id,status:"queued"}; validate(base+"api.schema.json#/$defs/Accepted",body); return this.reply(202,body);
    }
    if (req.method === "GET" && runMatch) { const body=await this.store.run(req.principal,runMatch[1]!); validate(base+"api.schema.json#/$defs/Run",body); return this.reply(200,body); }
    const understanding=req.path.match(/^\/v1\/sites\/([0-9a-f-]+)\/understanding$/);
    if (req.method === "GET" && understanding) { const body=await this.store.understanding(req.principal,understanding[1]!); validate(base+"api.schema.json#/$defs/Understanding",body); return this.reply(200,body); }
    const graph=req.path.match(/^\/v1\/sites\/([0-9a-f-]+)\/graph$/);
    if (req.method === "GET" && graph) { const body=await this.store.graph(req.principal,graph[1]!,{}); validate(base+"graph.schema.json",body); return this.reply(200,body); }
    const cancel=req.path.match(/^\/v1\/discovery-runs\/([0-9a-f-]+)\/cancel$/);
    if (req.method === "POST" && cancel) { await this.store.cancel(req.principal,cancel[1]!); return this.reply(202,{run_id:cancel[1],status:"cancelled"}); }
    return this.reply(404,{code:"not_found"});
  }
  private reply(status:number,body:unknown){return {status,body,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}};}
}
export function emptyUnderstanding(siteId:string):Understanding { return {site_id:siteId,twin_revision_id:null,watermark:0,cards:[],coverage:{status:"unknown",requested:0,observed:0,failed:0,excluded:0,deferred:0,denominator:"unknown_population",reason:"projection_pending"},missing_sources:["gsc","analytics","bing","serp","rankings","ai_answers"]}; }
export const requestId=()=>randomUUID();

/** Durable local-profile adapter. Authentication is supplied by the caller; it is never inferred from request data. */
export class PostgresReadOnlyStore implements ReadOnlyStore {
  private jobs: Jobs;
  constructor(private pool:Pool, private ledger:Ledger, deletion:DeletionLedger) { this.jobs=new Jobs(pool,deletion); }
  async submit(p:Principal,url:string,key:string) { const site=await this.ledger.registerSite(p,url); const run=await this.jobs.submitDiscovery(p,site,key); return {run_id:run,site_id:site}; }
  async run(p:Principal,id:string):Promise<Run> { return transaction(this.pool,"aios_runtime",async c=>{await scope(c,p,null,"read");const r=(await c.query("SELECT * FROM crawl WHERE tenant_id=$1 AND id=$2",[p.tenantId,id])).rows[0];if(!r)throw new Error("not_found");return {run_id:r.id,site_id:r.site_id,state:r.state,stage:r.stage,coverage:{status:r.state==='complete_in_scope'?"complete_in_scope":"unknown",requested:0,observed:0,failed:0,excluded:0,deferred:0,denominator:"unknown_population",reason:r.completion_reason},watermark:null,error:null};}); }
  async understanding(p:Principal,site:string):Promise<Understanding> { return transaction(this.pool,"aios_runtime",async c=>{await scope(c,p,site,"read");const r=(await c.query("SELECT * FROM publication WHERE tenant_id=$1 AND site_id=$2 ORDER BY watermark DESC LIMIT 1",[p.tenantId,site])).rows[0];return r?{site_id:site,twin_revision_id:r.twin_revision_id,watermark:Number(r.watermark),cards:r.cards,coverage:r.coverage,missing_sources:r.missing_sources}:emptyUnderstanding(site);}); }
  async graph(p:Principal,site:string):Promise<unknown> { return transaction(this.pool,"aios_runtime",async c=>{await scope(c,p,site,"read");const r=(await c.query("SELECT graph FROM publication WHERE tenant_id=$1 AND site_id=$2 ORDER BY watermark DESC LIMIT 1",[p.tenantId,site])).rows[0];if(!r)return {site_id:site,watermark:0,known_at:new Date().toISOString(),valid_at:new Date().toISOString(),view:"client",nodes:[],edges:[],truncated:false,next_cursor:null};return r.graph;}); }
  async cancel(p:Principal,id:string) { const r=await this.run(p,id); return this.jobs.cancel(p,r.site_id,id); }
}
