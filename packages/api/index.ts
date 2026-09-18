import { randomUUID } from "node:crypto";
import { base, validate, uuid } from "../contracts/index.js";
import type { Principal } from "../persistence/index.js";
import type { Pool } from "pg";
import { Ledger } from "../persistence/index.js";
import { Jobs } from "../jobs/index.js";
import { normalizeUrl } from "../perception/url.js";
import { DeletionLedger } from "../policy/deletion.js";
import { scope, transaction } from "../persistence/transaction.js";

export type Run = { run_id:string; site_id:string; state:"queued"|"running"|"complete_in_scope"|"partial"|"blocked"|"failed"|"cancelled"; stage:string; coverage:{status:"complete_in_scope"|"partial"|"unknown"|"not_applicable";requested:number;observed:number;failed:number;excluded:number;deferred:number;denominator:"requested_scope"|"unknown_population";reason:string|null}; watermark:number|null; error:null };
export type Understanding = { site_id:string; twin_revision_id:string|null; watermark:number; cards:any[]; coverage:Run["coverage"]; missing_sources:("gsc"|"analytics"|"bing"|"serp"|"rankings"|"ai_answers")[] };
export interface ReadOnlyStore { submit(p:Principal,url:string,key:string):Promise<{run_id:string;site_id:string;replayed?:boolean}>; run(p:Principal,id:string):Promise<Run>; understanding(p:Principal,site:string):Promise<Understanding>; graph(p:Principal,site:string,query:Record<string,string>):Promise<unknown>; cancel(p:Principal,id:string):Promise<void>; }
export type Request = { principal?:Principal; method:string; path:string; body?:unknown; csrf?:string };
export class ReadOnlyApi {
  constructor(private store:ReadOnlyStore, private csrfToken:string) {}
  async handle(req:Request):Promise<{status:number;body:unknown;headers:Record<string,string>}> {
    const id=requestId();
    const reply=(status:number,body:unknown)=>this.reply(status,body,id);
    const failure=(status:number,code:string,retryable=false)=>{
      const body={request_id:id,error:{code,retryable,detail:code,evidence_ids:[]}};
      validate(base+"api.schema.json#/$defs/Error",body);
      const result=reply(status,body);
      if(code==='projection_pending'||status===429)result.headers['retry-after']='5';
      return result;
    };
    try {
    if (!req.principal) return failure(401,"scope_denied");
    if (!["GET","POST"].includes(req.method)) return failure(405,"invalid_input");
    if (req.method === "POST" && req.csrf !== this.csrfToken) return failure(403,"scope_denied");
    if(req.method==='POST'){
      try {if(Buffer.byteLength(JSON.stringify(req.body)??'')>16384)return failure(400,'invalid_input');}
      catch {return failure(400,'invalid_input');}
    }
    const resource=req.path.match(/^\/v1\/(?:sites|discovery-runs)\/([^/?]+)(?:\/(?:understanding|graph|cancel))?$/);
    if(resource && req.path!=='/v1/sites/discovery-runs'){
      try {uuid(resource[1]);}catch{return failure(400,'invalid_input');}
    }
    const runMatch=req.path.match(/^\/v1\/discovery-runs\/([0-9a-f-]+)$/);
    if (req.method === "POST" && req.path === "/v1/sites/discovery-runs") {
      try {
        if(Buffer.byteLength(JSON.stringify(req.body)??'')>16384)return failure(400,'invalid_input');
        validate(base+"api.schema.json#/$defs/Submit",req.body);
        new URL((req.body as {url:string}).url);
      } catch { return failure(400,'schema_invalid'); }
      const b=req.body as {url:string;idempotency_key:string};
      try {if(normalizeUrl(b.url).excluded)return failure(422,'forbidden_destination');}
      catch(error){return failure((error as Error).message==='url_invalid'?400:422,(error as Error).message==='url_invalid'?'invalid_input':'forbidden_destination');}
      const v=await this.store.submit(req.principal,b.url,b.idempotency_key);
      if(v.replayed){const current=await this.store.run(req.principal,v.run_id);validate(base+"api.schema.json#/$defs/Run",current);if(current.state!=="queued")return reply(200,current);}
      const body={run_id:v.run_id,site_id:v.site_id,status:"queued"}; validate(base+"api.schema.json#/$defs/Accepted",body); return reply(202,body);
    }
    if (req.method === "GET" && runMatch) { const body=await this.store.run(req.principal,runMatch[1]!); validate(base+"api.schema.json#/$defs/Run",body); return reply(200,body); }
    const understanding=req.path.match(/^\/v1\/sites\/([0-9a-f-]+)\/understanding$/);
    if (req.method === "GET" && understanding) { const body=await this.store.understanding(req.principal,understanding[1]!); validate(base+"api.schema.json#/$defs/Understanding",body); return reply(200,body); }
    const graph=req.path.match(/^\/v1\/sites\/([0-9a-f-]+)\/graph$/);
    if (req.method === "GET" && graph) { const body=await this.store.graph(req.principal,graph[1]!,{}); validate(base+"graph.schema.json",body); return reply(200,body); }
    const cancel=req.path.match(/^\/v1\/discovery-runs\/([0-9a-f-]+)\/cancel$/);
    if (req.method === "POST" && cancel) { await this.store.cancel(req.principal,cancel[1]!); const body=await this.store.run(req.principal,cancel[1]!);validate(base+"api.schema.json#/$defs/Run",body);return reply(202,body); }
    return failure(404,"scope_denied");
    } catch(error) {
      const code=error instanceof Error?error.message:'';
      if(code==='scope_denied'&&req.path==='/v1/sites/discovery-runs')return failure(403,'scope_denied');
      if(['scope_denied','not_found','deleted_scope'].includes(code))return failure(404,'scope_denied');
      if(code==='conflict')return failure(409,'conflict');
      if(code==='projection_pending')return failure(503,code,true);
      if(code==='policy_unavailable')return failure(503,'policy_blocked',true);
      if(code==='policy_blocked')return failure(503,code);
      if(code==='forbidden_destination')return failure(422,code);
      if(code==='admission_limited'||code==='budget_exhausted')return failure(429,'budget_exhausted',true);
      if(code==='invalid_input')return failure(400,code);
      const transport=(error as {code?:string})?.code;
      if(transport && (/^08/.test(transport)||['57P01','57P02','57P03','ECONNREFUSED','ECONNRESET'].includes(transport)))return failure(503,'source_unavailable',true);
      return failure(500,'internal_error');
    }
  }
  private reply(status:number,body:unknown,id:string){
    if(Buffer.byteLength(JSON.stringify(body))>2097152){status=503;body={request_id:id,error:{code:"response_too_large",retryable:false,detail:"response_too_large",evidence_ids:[]}};}
    return {status,body,headers:{"x-request-id":id,"cache-control":"no-store","x-content-type-options":"nosniff"} as Record<string,string>};}
}
export function emptyUnderstanding(siteId:string):Understanding { return {site_id:siteId,twin_revision_id:null,watermark:0,cards:[],coverage:{status:"unknown",requested:0,observed:0,failed:0,excluded:0,deferred:0,denominator:"unknown_population",reason:"projection_pending"},missing_sources:["gsc","analytics","bing","serp","rankings","ai_answers"]}; }
export const requestId=()=>randomUUID();

/** Durable local-profile adapter. Authentication is supplied by the caller; it is never inferred from request data. */
export class PostgresReadOnlyStore implements ReadOnlyStore {
  private jobs: Jobs;
  constructor(private pool:Pool, private ledger:Ledger, private deletion:DeletionLedger) { this.jobs=new Jobs(pool,deletion); }
  async submit(p:Principal,url:string,key:string) { const site=await this.ledger.registerSite(p,url); const run=await this.jobs.submitDiscoveryReceipt(p,site,key); return {run_id:run.runId,site_id:site,replayed:run.replayed}; }
  async run(p:Principal,id:string):Promise<Run> {
    uuid(p.tenantId);uuid(p.userId);uuid(id);
    return transaction(this.pool,"aios_runtime",async c=>{
      // Resolve only under tenant RLS; a null-site authorization incorrectly
      // rejects every site-limited membership. Never expose the row before
      // authorizing the resolved site itself.
      await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",[p.tenantId,p.userId]);
      const r=(await c.query("SELECT * FROM crawl WHERE tenant_id=$1 AND id=$2",[p.tenantId,id])).rows[0];
      if(!r)throw new Error("not_found");
      await scope(c,p,r.site_id,"read");
      if(await this.deletion.contains(p.tenantId,r.site_id))throw new Error("deleted_scope");
      return {run_id:r.id,site_id:r.site_id,state:r.state,stage:r.stage,
        coverage:{status:r.state==='complete_in_scope'?"complete_in_scope":"unknown",requested:0,observed:0,failed:0,excluded:0,deferred:0,denominator:"unknown_population",reason:r.completion_reason},watermark:null,error:null};
    });
  }
  /** No legacy JSON is a governed projection. Missing gates never count as pass. */
  private async requireGovernedPublication(p:Principal,site:string):Promise<never> {
    return transaction(this.pool,"aios_runtime",async c=>{
      await scope(c,p,site,"read");
      if(await this.deletion.contains(p.tenantId,site))throw new Error("deleted_scope");
      const exists=await c.query("SELECT 1 FROM publication WHERE tenant_id=$1 AND site_id=$2 LIMIT 1",[p.tenantId,site]);
      throw new Error(exists.rowCount?"policy_blocked":"projection_pending");
    });
  }
  async understanding(p:Principal,site:string):Promise<Understanding> {return this.requireGovernedPublication(p,site);}
  async graph(p:Principal,site:string):Promise<unknown> {return this.requireGovernedPublication(p,site);}
  async cancel(p:Principal,id:string) { const r=await this.run(p,id); return this.jobs.cancel(p,r.site_id,id); }
}
