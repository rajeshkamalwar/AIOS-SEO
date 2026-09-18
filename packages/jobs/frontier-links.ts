import type { Pool } from 'pg';
import { uuid,manifestHash } from '../contracts/index.js';
import type { Principal } from '../persistence/index.js';
import { transaction,event } from '../persistence/transaction.js';
import type { LocalBlobs } from '../evidence/index.js';
import { DeletionLedger } from '../policy/deletion.js';
import { pageAllowed } from '../perception/robots-admission.js';
import { normalizeUrl } from '../perception/url.js';
import { extractHtmlIsolated } from '../perception/dom-isolated.js';
import { frontierContext } from './frontier-context.js';
import type { FrontierBatch } from './frontier.js';
export type LinkDiscovery={state:'discovered';counts:FrontierBatch}|{state:'not_discovered';reason:string};
/** Deterministic interpretation of retained fixture HTML. Never dispatches a request. */
export class FixtureLinkFrontier {
 constructor(private pool:Pool,private deletions:DeletionLedger,private artifacts:Pick<LocalBlobs,'read'>){}
 async discoverLinks(p:Principal,site:string,run:string,bundleId:string,snapshotId:string,robotsObservationId:string):Promise<LinkDiscovery>{
  for(const id of [site,run,bundleId,snapshotId,robotsObservationId])uuid(id);
  return transaction(this.pool,'aios_runtime',async c=>{
   const ctx=await frontierContext(c,p,site,run,bundleId,robotsObservationId,this.deletions,this.artifacts);
   const snapshot=(await c.query('SELECT s.*,p.url FROM page_snapshot s JOIN page p ON p.tenant_id=s.tenant_id AND p.site_id=s.site_id AND p.id=s.page_id WHERE s.tenant_id=$1 AND s.site_id=$2 AND s.crawl_id=$3 AND s.id=$4 AND s.knowledge_seq<=$5',[p.tenantId,site,run,snapshotId,ctx.bundle.known_seq])).rows[0];
   if(!snapshot)throw new Error('snapshot_unavailable');
   const parent=(await c.query('SELECT * FROM crawl_target WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3 AND url_key=$4 AND admitted',[p.tenantId,site,run,snapshot.url])).rows[0];
   if(!parent)throw new Error('parent_unavailable');
   await ctx.assertInputs([snapshot.id,parent.id,snapshot.page_id]);
   if(Number(parent.depth)>=6)return {state:'not_discovered',reason:'depth_budget'};
   if(snapshot.state!=='captured'||snapshot.truncated||Number(snapshot.status_code)<200||Number(snapshot.status_code)>=300)return {state:'not_discovered',reason:'incomplete_raw_snapshot'};
   const raw=await ctx.http(snapshot.observation_id);
   if(!raw.body||raw.body.row.id!==snapshot.evidence_id||raw.body.row.sha256!==snapshot.content_hash||raw.value.status_code!==Number(snapshot.status_code)||raw.value.url!==snapshot.url)throw new Error('snapshot_context_invalid');
   const contentType=raw.value.headers.find((h:{name:string;value:string})=>h.name.toLowerCase()==='content-type')?.value??raw.body.row.mime_type;
   const extraction=await extractHtmlIsolated(raw.body.bytes,{evidenceId:raw.body.row.id,sha256:raw.body.row.sha256,responseUrl:raw.value.url,contentType,truncated:false,policyLimited:false});
   await ctx.recheck();
   if(extraction.state==='not_extracted')return {state:'not_discovered',reason:extraction.reason};
   if(extraction.coverage!=='complete_input')return {state:'not_discovered',reason:'partial_extraction'};
   const exclusions={invalid:0,action:0,outOfScope:0,budget:0};
   const candidates=new Map<string,{url:string;priority:number;allowed:boolean;source:typeof extraction.anchors[number]['source']}>();
   for(const anchor of extraction.anchors){
    if(anchor.value===null)continue;
    if(anchor.resolved===null){exclusions.invalid++;continue;}
    try{
     const u=normalizeUrl(anchor.resolved);
     if(u.excluded){exclusions.action++;continue;}
     if(new URL(u.url).origin!==ctx.r.normalized_origin){exclusions.outOfScope++;continue;}
     const path=new URL(u.url).pathname;
     if(!candidates.has(u.url))candidates.set(u.url,{url:u.url,priority:/^\/(?:about|contact|services?)(?:\/|$)/.test(path)||path==='/'?1:3,allowed:pageAllowed(ctx.policy,u.url),source:anchor.source});
    }catch{exclusions.invalid++;}
   }
   const values=[...candidates.values()].sort((a,b)=>a.priority-b.priority||(a.url<b.url?-1:a.url>b.url?1:0));
   const digest=manifestHash({run,bundleId,snapshotId,robotsObservationId,parentId:parent.id,depth:Number(parent.depth)+1,candidates:values,exclusions,policy:'discovery-v1'});
   const prior=(await c.query('SELECT * FROM fixture_link_batch WHERE tenant_id=$1 AND crawl_id=$2 AND page_snapshot_id=$3',[p.tenantId,run,snapshotId])).rows[0];
   if(prior){if(prior.input_hash!==digest)throw new Error('conflict');return {state:'discovered',counts:prior.result};}
   const counts=(await c.query('SELECT control.discover_fixture_links($1,$2,$3,$4,$5,$6,$7) AS result',[run,bundleId,snapshotId,robotsObservationId,digest,JSON.stringify(values),JSON.stringify(exclusions)])).rows[0].result as FrontierBatch;
   await event(c,p.tenantId,site,run,run,'frontier.links_updated',{crawl_id:run,page_snapshot_id:snapshotId,robots_observation_id:robotsObservationId,discovered_count:counts.discovered_count,admitted_count:counts.admitted_count,excluded_count:counts.excluded_count,deferred_count:counts.deferred_count});
   await ctx.recheck();return {state:'discovered',counts};
  });
 }
}
