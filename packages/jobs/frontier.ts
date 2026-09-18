import { frontierContext } from './frontier-context.js';
import type { Pool } from 'pg';
import { uuid,manifestHash } from '../contracts/index.js';
import type { Principal } from '../persistence/index.js';
import { transaction,event } from '../persistence/transaction.js';
import type { LocalBlobs } from '../evidence/index.js';
import { DeletionLedger } from '../policy/deletion.js';
import { parseSitemap } from '../perception/sitemap.js';
import { pageAllowed } from '../perception/robots-admission.js';
import { normalizeUrl } from '../perception/url.js';

export interface FrontierBatch {
 inserted_count:number;discovered_count:number;admitted_count:number;excluded_count:number;deferred_count:number;overflow_count:number;
 source_excluded:{invalid:number;action:number;outOfScope:number;budget:number};
}
/** Local persisted sitemap/robots interpretation only; never creates or runs a fetch job. */
export class FixtureFrontier {
 constructor(private pool:Pool,private deletions:DeletionLedger,private artifacts:Pick<LocalBlobs,'read'>){}
 async discoverSitemap(p:Principal,site:string,run:string,bundleId:string,sitemapObservationId:string,robotsObservationId:string):Promise<FrontierBatch>{
  for(const id of [site,run,bundleId,sitemapObservationId,robotsObservationId])uuid(id);
  if(!(this.deletions instanceof DeletionLedger))throw new Error('deletion_adapter_required');
  return transaction(this.pool,'aios_runtime',async c=>{
   const {r,acceptedScope,http,policy,recheck,current}=await frontierContext(c,p,site,run,bundleId,robotsObservationId,this.deletions,this.artifacts);
   const batches=(await c.query('SELECT sitemap_observation_id FROM fixture_frontier_batch WHERE tenant_id=$1 AND crawl_id=$2',[p.tenantId,run])).rows;
   if(batches.length>=20&&!batches.some(x=>x.sitemap_observation_id===sitemapObservationId))throw new Error('sitemap_budget');
   const sitemap=await http(sitemapObservationId);
   if(!sitemap.body||sitemap.value.status_code<200||sitemap.value.status_code>=300||!['text/plain','application/xml','text/xml'].includes(sitemap.body.row.mime_type))throw new Error('sitemap_unavailable');
   const sitemapSources=[r.normalized_origin+'/sitemap.xml',...policy.document.sitemaps.map(x=>{try{return normalizeUrl(x).url;}catch{return null;}})];
   if(!sitemapSources.includes(sitemap.value.url))throw new Error('sitemap_source_invalid');
   if(!pageAllowed(policy,sitemap.value.url))throw new Error('robots_denied');
   const parsed=parseSitemap(sitemap.body.bytes,r.normalized_origin);
   if(parsed.kind==='sitemapindex')throw new Error('sitemap_index_unsupported');
   const urls=[...new Set([r.submitted_url,...parsed.urls])];
   const candidates=urls.map(url=>{
    const normalized=normalizeUrl(url);if(normalized.excluded||normalized.url!==url)throw new Error('source_unavailable');
    const path=new URL(url).pathname;
    return {url,priority:url===r.submitted_url?0:/^\/(?:about|contact|services?)(?:\/|$)/.test(path)||path==='/'?1:2,allowed:pageAllowed(policy,url)};
   });
   const inputHash=manifestHash({run,bundleId,sitemapObservationId,robotsObservationId,scopeEvidence:acceptedScope.evidence_id,candidates,exclusions:parsed.excluded,policy:'discovery-v1'});
   await recheck();
   const prior=(await c.query('SELECT * FROM fixture_frontier_batch WHERE tenant_id=$1 AND crawl_id=$2 AND sitemap_observation_id=$3',[p.tenantId,run,sitemapObservationId])).rows[0];
   if(prior){if(prior.input_hash!==inputHash)throw new Error('conflict');return prior.result as FrontierBatch;}
   const result=(await c.query('SELECT control.discover_fixture_sitemap($1,$2,$3,$4,$5,$6,$7) AS result',[run,bundleId,sitemapObservationId,robotsObservationId,inputHash,JSON.stringify(candidates),JSON.stringify(parsed.excluded)])).rows[0].result as FrontierBatch;
   await event(c,p.tenantId,site,run,run,'frontier.updated',{crawl_id:run,sitemap_observation_id:sitemapObservationId,robots_observation_id:robotsObservationId,discovered_count:result.discovered_count,admitted_count:result.admitted_count,excluded_count:result.excluded_count,deferred_count:result.deferred_count});
   await current();return result;
  });
 }
}
