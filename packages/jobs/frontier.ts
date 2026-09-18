import type { Pool } from 'pg';
import { base,validate,uuid,hash,manifestHash } from '../contracts/index.js';
import type { Principal } from '../persistence/index.js';
import { transaction,scope,registryLock,workLock,event } from '../persistence/transaction.js';
import type { LocalBlobs } from '../evidence/index.js';
import { DeletionLedger } from '../policy/deletion.js';
import { parseSitemap } from '../perception/sitemap.js';
import { robotsState,pageAllowed } from '../perception/robots-admission.js';
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
   await c.query('SELECT pg_advisory_xact_lock_shared($1)',[registryLock]);await c.query('SELECT pg_advisory_xact_lock($1)',[workLock]);
   const current=async()=>{
    await scope(c,p,site);if(await this.deletions.contains(p.tenantId,site))throw new Error('deleted_scope');
    const r=(await c.query(`SELECT r.*,f.quarantined,f.deletion_epoch AS pinned_epoch,t.deletion_epoch,t.policy_profile_id,s.submitted_url,s.normalized_origin,s.version AS site_version
     FROM crawl r JOIN work_fence f ON f.tenant_id=r.tenant_id AND f.crawl_id=r.id JOIN tenant t ON t.id=r.tenant_id JOIN site s ON s.tenant_id=r.tenant_id AND s.id=r.site_id
     WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.id=$3 FOR UPDATE OF r`,[p.tenantId,site,run])).rows[0];
    if(!r||r.submitted_by!==p.userId)throw new Error('scope_denied');
    if(!['queued','running'].includes(r.state)||r.quarantined||r.pinned_epoch!==r.deletion_epoch)throw new Error('run_fenced');
    if(r.policy_profile_id!=='local-synthetic-v1'||r.policy_version!=='discovery-v1'||!(await c.query("SELECT 1 FROM control.health WHERE singleton AND policy_version='discovery-v1' AND restore_ready AND verified_until>clock_timestamp() AND clock_timestamp()<$1::timestamptz",[r.budget.deadline])).rowCount)throw new Error('policy_unavailable');
    return r;
   };
   const r=await current();
   const batches=(await c.query('SELECT sitemap_observation_id FROM fixture_frontier_batch WHERE tenant_id=$1 AND crawl_id=$2',[p.tenantId,run])).rows;
   if(batches.length>=20&&!batches.some(x=>x.sitemap_observation_id===sitemapObservationId))throw new Error('sitemap_budget');
   const bundle=(await c.query("SELECT * FROM evidence_bundle WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND state='frozen'",[p.tenantId,site,bundleId])).rows[0];
   if(!bundle)throw new Error('bundle_membership_required');
   const links=(await c.query('SELECT field_name,target_id FROM record_link WHERE tenant_id=$1 AND owner_id=$2',[p.tenantId,bundleId])).rows;
   const pinned=(field:string,id:string)=>links.some(l=>l.field_name===field&&l.target_id===id);
   const observation=async(id:string)=>{
    if(!pinned('observation_ids',id))throw new Error('bundle_membership_required');
    const row=(await c.query("SELECT * FROM observation WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND knowledge_seq<=$4 AND fresh_until>clock_timestamp() AND observed_at<=clock_timestamp() AND state='observed'",[p.tenantId,site,id,bundle.known_seq])).rows[0];
    if(!row)throw new Error('source_unavailable');return row;
   };
   const evidenceIds:string[]=[];
   const evidence=async(id:string)=>{
    evidenceIds.push(id);
    if(!pinned('evidence_ids',id))throw new Error('bundle_membership_required');
    const row=(await c.query("SELECT * FROM evidence WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND knowledge_seq<=$4 AND state='available' AND expires_at>clock_timestamp()",[p.tenantId,site,id,bundle.known_seq])).rows[0];
    if(!row)throw new Error('source_unavailable');
    const bytes=await this.artifacts.read(row.artifact_key,row.sha256,Number(row.bytes));
    if(hash(bytes)!==row.sha256||bytes.length!==Number(row.bytes))throw new Error('artifact_integrity_failed');return {row,bytes};
   };
   const acceptedScope=(await c.query('SELECT * FROM site_scope_acceptance WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3',[p.tenantId,site,run])).rows[0];
   if(!acceptedScope)throw new Error('scope_receipt_required');
   const scopeObservation=await observation(acceptedScope.observation_id),scopeEvidence=await evidence(acceptedScope.evidence_id);
   const receipt=JSON.parse(scopeEvidence.bytes.toString('utf8'));validate(base+'scope-receipt.schema.json',receipt);
   if(scopeEvidence.row.source_class!=='internal_policy'||scopeObservation.sensor_id!=='site-scope'||scopeObservation.subject_id!==run||scopeObservation.context_hash!==hash(scopeEvidence.bytes)||receipt.tenant_id!==p.tenantId||receipt.site_id!==site||receipt.crawl_id!==run||receipt.submitted_by!==p.userId||receipt.submitted_url!==r.submitted_url||receipt.normalized_origin!==r.normalized_origin||receipt.site_version!==Number(r.site_version)||receipt.deletion_epoch!==Number(r.deletion_epoch)||Date.parse(receipt.expires_at)!==Date.parse(r.budget.deadline))throw new Error('scope_receipt_invalid');
   const http=async(id:string)=>{
    const obs=await observation(id);if(obs.sensor_id!=='http-fixture')throw new Error('source_unavailable');
    const accepted=(await c.query('SELECT * FROM http_fixture_acceptance WHERE tenant_id=$1 AND site_id=$2 AND observation_id=$3',[p.tenantId,site,id])).rows[0];
    if(!accepted)throw new Error('source_unavailable');
    const context=await evidence(accepted.receipt_evidence_id),value=JSON.parse(context.bytes.toString('utf8'));validate(base+'http-receipt.schema.json',value);
    const body=accepted.body_evidence_id?await evidence(accepted.body_evidence_id):null;
    if(context.row.mime_type!=='application/json'||obs.context_hash!==hash(context.bytes)||value.body_evidence_id!==accepted.body_evidence_id||value.error!==null||value.truncated||value.method!=='GET'||value.url!==value.final_url||value.final_url!==context.row.source_uri||new URL(value.final_url).origin!==r.normalized_origin||body&&body.row.source_uri!==value.final_url)throw new Error('source_unavailable');
    const provenance=(await c.query("SELECT target_id FROM record_link WHERE tenant_id=$1 AND owner_id=$2 AND field_name='evidence_ids'",[p.tenantId,id])).rows.map(x=>x.target_id);
    if(!provenance.includes(accepted.receipt_evidence_id)||body&&!provenance.includes(accepted.body_evidence_id))throw new Error('source_unavailable');
    return {value,body,obs};
   };
   const robots=await http(robotsObservationId);
   if(robots.body&&robots.body.bytes.length>512000||!(await c.query("SELECT 1 WHERE $1::timestamptz>clock_timestamp()-interval '24 hours'",[robots.obs.observed_at])).rowCount)throw new Error('robots_unavailable');
   if(robots.value.url!==r.normalized_origin+'/robots.txt')throw new Error('robots_source_invalid');
   const policy=robotsState({status:robots.value.status_code,body:robots.body?.bytes??null,truncated:robots.value.truncated});
   if(policy.state!=='known')throw new Error('robots_unavailable');
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
   await current();
   for(const id of [acceptedScope.observation_id,sitemapObservationId,robotsObservationId])await observation(id);
   if(!(await c.query("SELECT 1 WHERE $1::timestamptz>clock_timestamp()-interval '24 hours'",[robots.obs.observed_at])).rowCount||
      (await c.query("SELECT count(*)::integer AS count FROM evidence WHERE tenant_id=$1 AND site_id=$2 AND id=ANY($3::uuid[]) AND state='available' AND expires_at>clock_timestamp()",[p.tenantId,site,[...new Set(evidenceIds)]])).rows[0].count!==new Set(evidenceIds).size)throw new Error('source_unavailable');
   const prior=(await c.query('SELECT * FROM fixture_frontier_batch WHERE tenant_id=$1 AND crawl_id=$2 AND sitemap_observation_id=$3',[p.tenantId,run,sitemapObservationId])).rows[0];
   if(prior){if(prior.input_hash!==inputHash)throw new Error('conflict');return prior.result as FrontierBatch;}
   const result=(await c.query('SELECT control.discover_fixture_sitemap($1,$2,$3,$4,$5,$6,$7) AS result',[run,bundleId,sitemapObservationId,robotsObservationId,inputHash,JSON.stringify(candidates),JSON.stringify(parsed.excluded)])).rows[0].result as FrontierBatch;
   await event(c,p.tenantId,site,run,run,'frontier.updated',{crawl_id:run,sitemap_observation_id:sitemapObservationId,robots_observation_id:robotsObservationId,discovered_count:result.discovered_count,admitted_count:result.admitted_count,excluded_count:result.excluded_count,deferred_count:result.deferred_count});
   await current();return result;
  });
 }
}
