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
 sitemap?:{kind:'urlset'|'text'|'sitemapindex';depth:number;declared_count:number;eligible_count:number;depth_deferred_count:number};
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
   const {r,acceptedScope,http,policy,recheck,current,assertInputs}=await frontierContext(c,p,site,run,bundleId,robotsObservationId,this.deletions,this.artifacts);
   const seed=(await c.query("SELECT id FROM crawl_target WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3 AND seed_kind='submitted' AND url_key=$4",[p.tenantId,site,run,r.submitted_url])).rows[0];
   if(!seed)throw new Error('seed_unavailable');
   await assertInputs([seed.id]);
   const batches=(await c.query('SELECT sitemap_observation_id FROM fixture_frontier_batch WHERE tenant_id=$1 AND crawl_id=$2',[p.tenantId,run])).rows;
   if(batches.length>=20&&!batches.some(x=>x.sitemap_observation_id===sitemapObservationId))throw new Error('sitemap_budget');
   const sitemap=await http(sitemapObservationId);
   if(!sitemap.body||sitemap.value.status_code<200||sitemap.value.status_code>=300||!['text/plain','application/xml','text/xml'].includes(sitemap.body.row.mime_type))throw new Error('sitemap_unavailable');
   const sitemapSources=[r.normalized_origin+'/sitemap.xml',...policy.document.sitemaps.map(x=>{try{return normalizeUrl(x).url;}catch{return null;}})];
   const documents=(await c.query('SELECT * FROM fixture_sitemap_document WHERE tenant_id=$1 AND crawl_id=$2 ORDER BY depth,source_url COLLATE "C"',[p.tenantId,run])).rows;
   const existing=documents.find(d=>d.source_url===sitemap.value.url);
   if(existing&&existing.observation_id!==sitemapObservationId)throw new Error('sitemap_document_conflict');
   let parent=existing?.parent_observation_id?documents.find(d=>d.observation_id===existing.parent_observation_id):null;
   if(!existing&&!sitemapSources.includes(sitemap.value.url))parent=documents.find(d=>d.kind==='sitemapindex'&&d.depth<2&&d.children.some((x:{url:string;state:string})=>x.url===sitemap.value.url&&x.state==='eligible'));
   if(!existing&&!sitemapSources.includes(sitemap.value.url)&&!parent)throw new Error('sitemap_source_invalid');
   const depth=existing?.depth??(parent?parent.depth+1:0);
   let chain=parent;const visited=new Set<string>();let childUrl=sitemap.value.url;
   while(chain){
    if(visited.has(chain.observation_id)||visited.size>=2)throw new Error('sitemap_parent_invalid');visited.add(chain.observation_id);
    const source=await http(chain.observation_id);
    if(!source.body||source.body.row.id!==chain.body_evidence_id||source.context.row.id!==chain.receipt_evidence_id||source.value.url!==chain.source_url||source.value.status_code<200||source.value.status_code>=300||!pageAllowed(policy,source.value.url))throw new Error('sitemap_parent_invalid');
    const index=parseSitemap(source.body.bytes,r.normalized_origin);
    if(index.kind!=='sitemapindex'||!index.sitemaps.includes(childUrl))throw new Error('sitemap_parent_invalid');
    childUrl=chain.source_url;
    if(chain.parent_observation_id){const next=documents.find(d=>d.observation_id===chain.parent_observation_id);if(!next||next.depth+1!==chain.depth)throw new Error('sitemap_parent_invalid');chain=next;}
    else{if(chain.depth!==0||!sitemapSources.includes(chain.source_url))throw new Error('sitemap_parent_invalid');chain=null;}
   }
   if(!pageAllowed(policy,sitemap.value.url))throw new Error('robots_denied');
   const parsed=parseSitemap(sitemap.body.bytes,r.normalized_origin);
   const children=existing?.children??parsed.sitemaps.map(url=>({url,state:url===sitemap.value.url||documents.some(d=>d.source_url===url)?'already_seen':!pageAllowed(policy,url)?'robots_denied':depth>=2?'depth_deferred':'eligible'}));
   const sitemapMetadata={kind:parsed.kind,depth,declared_count:children.length,eligible_count:children.filter((x:{state:string})=>x.state==='eligible').length,depth_deferred_count:children.filter((x:{state:string})=>x.state==='depth_deferred').length};
   const urls=[...new Set([r.submitted_url,...parsed.urls])];
   const candidates=urls.map(url=>{
    const normalized=normalizeUrl(url);if(normalized.excluded||normalized.url!==url)throw new Error('source_unavailable');
    const path=new URL(url).pathname;
    return {url,priority:url===r.submitted_url?0:/^\/(?:about|contact|services?)(?:\/|$)/.test(path)||path==='/'?1:2,allowed:pageAllowed(policy,url)};
   });
   const inputHash=manifestHash({run,bundleId,sitemapObservationId,robotsObservationId,scopeEvidence:acceptedScope.evidence_id,document:{kind:parsed.kind,depth,parent:parent?.observation_id??null,children},candidates,exclusions:parsed.excluded,policy:'discovery-v1'});
   await recheck();
   const prior=(await c.query('SELECT * FROM fixture_frontier_batch WHERE tenant_id=$1 AND crawl_id=$2 AND sitemap_observation_id=$3',[p.tenantId,run,sitemapObservationId])).rows[0];
   if(prior){
    if(!existing){const legacyHash=manifestHash({run,bundleId,sitemapObservationId,robotsObservationId,scopeEvidence:acceptedScope.evidence_id,candidates,exclusions:parsed.excluded,policy:'discovery-v1'});if(prior.input_hash===legacyHash)return prior.result as FrontierBatch;}
    if(prior.input_hash!==inputHash)throw new Error('conflict');return {...prior.result,sitemap:sitemapMetadata} as FrontierBatch;
   }
   if((await c.query('SELECT 1 FROM fixture_frontier_batch b JOIN http_fixture_acceptance a ON a.tenant_id=b.tenant_id AND a.observation_id=b.sitemap_observation_id JOIN evidence e ON e.tenant_id=a.tenant_id AND e.id=a.body_evidence_id WHERE b.tenant_id=$1 AND b.crawl_id=$2 AND e.source_uri=$3 AND b.sitemap_observation_id<>$4',[p.tenantId,run,sitemap.value.url,sitemapObservationId])).rowCount)throw new Error('sitemap_document_conflict');
   const result=(await c.query('SELECT control.discover_fixture_sitemap($1,$2,$3,$4,$5,$6,$7) AS result',[run,bundleId,sitemapObservationId,robotsObservationId,inputHash,JSON.stringify(candidates),JSON.stringify(parsed.excluded)])).rows[0].result as FrontierBatch;
   await c.query('SELECT control.retain_sitemap_document($1,$2,$3,$4,$5,$6)',[run,sitemapObservationId,parsed.kind,depth,parent?.observation_id??null,JSON.stringify(children)]);
   await event(c,p.tenantId,site,run,run,'frontier.updated',{crawl_id:run,sitemap_observation_id:sitemapObservationId,robots_observation_id:robotsObservationId,discovered_count:result.discovered_count,admitted_count:result.admitted_count,excluded_count:result.excluded_count,deferred_count:result.deferred_count});
   await recheck();return {...result,sitemap:sitemapMetadata};
  });
 }
}
