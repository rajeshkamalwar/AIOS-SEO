import type { PoolClient } from 'pg';
import { base,validate,hash,manifestHash } from '../contracts/index.js';
import { assertInputsEligible } from '../policy/input-eligibility.js';
import { prepareOfflineRenderInput,type PreparedOfflineRenderInput } from '../perception/render-input.js';
import { pageAllowed } from '../perception/robots-admission.js';
import { frontierContext } from './frontier-context.js';
import type { Lease } from './index.js';
import type { DeletionLedger } from '../policy/deletion.js';
type Row=Record<string,any>;
export interface OfflineRenderPreparation {
 source:{tenantId:string;siteId:string;crawlId:string;pageSnapshotId:string;pageId:string;observationId:string;rawEvidenceId:string;receiptEvidenceId:string;bundleId:string;knownSeq:number};
 prepared:PreparedOfflineRenderInput|{state:'not_prepared';reason:'incomplete_raw_snapshot'};
}
export interface OfflineRenderSource {
 snapshot:Row;page:Row;target:Row;bundle:Row;scopeAcceptance:Row;accepted:Row;robotsAccepted:Row;robotsObservationId:string;
 evidence:Row[];observations:Row[];links:Row[];ids:string[];fingerprint:string;
}
/** Resolve only persisted accepted source identities under the caller's lease gates.
 * No artifact I/O, writes, rendering or dispatch occurs in this helper. */
export async function resolveOfflineRenderSource(c:PoolClient,l:Lease,bundleId:string,snapshotId:string):Promise<OfflineRenderSource>{
 const args=[l.tenantId,l.siteId];
 const bundle=(await c.query("SELECT * FROM evidence_bundle WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND state='frozen' AND deleted_at IS NULL",[...args,bundleId])).rows[0];
 if(!bundle)throw new Error('bundle_membership_required');
 const snapshot=(await c.query('SELECT * FROM page_snapshot WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3 AND id=$4 AND deleted_at IS NULL AND knowledge_seq<=$5 AND (superseded_seq IS NULL OR superseded_seq>$5)',[...args,l.runId,snapshotId,bundle.known_seq])).rows[0];
 if(!snapshot)throw new Error('snapshot_unavailable');
 const page=(await c.query("SELECT * FROM page WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND state='active' AND deleted_at IS NULL AND knowledge_seq<=$4",[...args,snapshot.page_id,bundle.known_seq])).rows[0];
 if(!page)throw new Error('snapshot_unavailable');
 const target=(await c.query('SELECT * FROM crawl_target WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3 AND url_key=$4 AND admitted AND deleted_at IS NULL AND knowledge_seq<=$5',[...args,l.runId,page.url,bundle.known_seq])).rows[0];
 if(!target)throw new Error('parent_unavailable');
 const site=(await c.query("SELECT * FROM site WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",args)).rows[0];
 if(!site)throw new Error('scope_denied');
 const scopeAcceptance=(await c.query('SELECT * FROM site_scope_acceptance WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3',[...args,l.runId])).rows[0];
 if(!scopeAcceptance)throw new Error('scope_receipt_required');
 const robots=(await c.query('SELECT robots_observation_id FROM fixture_frontier_batch WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3 UNION SELECT robots_observation_id FROM fixture_link_batch WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3',[...args,l.runId])).rows;
 if(robots.length!==1)throw new Error(robots.length?'robots_context_conflict':'robots_unavailable');
 const robotsObservationId=robots[0]!.robots_observation_id as string;
 if(!(await c.query("SELECT 1 FROM observation WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND observed_at>clock_timestamp()-interval '24 hours'",[...args,robotsObservationId])).rowCount)throw new Error('robots_unavailable');
 const accepted=(await c.query('SELECT * FROM http_fixture_acceptance WHERE tenant_id=$1 AND site_id=$2 AND observation_id=$3',[...args,snapshot.observation_id])).rows[0];
 const robotsAccepted=(await c.query('SELECT * FROM http_fixture_acceptance WHERE tenant_id=$1 AND site_id=$2 AND observation_id=$3',[...args,robotsObservationId])).rows[0];
 if(!accepted||accepted.body_evidence_id!==snapshot.evidence_id||!robotsAccepted)throw new Error('snapshot_unavailable');
 const observationIds=[...new Set<string>([snapshot.observation_id,scopeAcceptance.observation_id,robotsObservationId])];
 const evidenceIds=[...new Set<string>([accepted.body_evidence_id,accepted.receipt_evidence_id,scopeAcceptance.evidence_id,robotsAccepted.receipt_evidence_id,...(robotsAccepted.body_evidence_id?[robotsAccepted.body_evidence_id]:[])])];
 const observations=(await c.query("SELECT * FROM observation WHERE tenant_id=$1 AND site_id=$2 AND id=ANY($3::uuid[]) AND state IN ('observed','partial') AND deleted_at IS NULL AND observed_at<=clock_timestamp() AND fresh_until>clock_timestamp() AND knowledge_seq<=$4 ORDER BY id",[...args,observationIds,bundle.known_seq])).rows;
 const evidence=(await c.query("SELECT * FROM evidence WHERE tenant_id=$1 AND site_id=$2 AND id=ANY($3::uuid[]) AND state='available' AND deleted_at IS NULL AND expires_at>clock_timestamp() AND knowledge_seq<=$4 ORDER BY id",[...args,evidenceIds,bundle.known_seq])).rows;
 if(observations.length!==observationIds.length||evidence.length!==evidenceIds.length)throw new Error('source_unavailable');
 const roots=[...new Set([l.runId,l.siteId,bundleId,snapshotId,page.id,target.id,...observationIds,...evidenceIds])];
 // Follow actual typed dependencies, not every member of a bundle or a Page's
 // historical identity provenance. Independent bundle members remain independent.
 // Sitemap/link admission ancestors still cannot launder rejected source inputs.
 const closure=(await c.query(`WITH RECURSIVE refs(id) AS (
  SELECT unnest($2::uuid[]) UNION
  SELECT next.target_id FROM refs p CROSS JOIN LATERAL (
   SELECT z.target_id FROM record_link z JOIN record_index owner ON owner.tenant_id=z.tenant_id AND owner.id=z.owner_id
   WHERE z.tenant_id=$1 AND z.owner_id=p.id AND ((owner.record_type IN ('PageSnapshot','CrawlTarget','Evidence') AND z.field_name='provenance_ids') OR (owner.record_type='Observation' AND z.field_name='evidence_ids'))
   UNION SELECT x.page_id FROM page_snapshot x WHERE x.tenant_id=$1 AND x.id=p.id
   UNION SELECT x.discovered_from_id FROM crawl_target x WHERE x.tenant_id=$1 AND x.id=p.id AND x.discovered_from_id IS NOT NULL
   UNION SELECT b.page_snapshot_id FROM crawl_target x JOIN fixture_link_batch b ON b.tenant_id=x.tenant_id AND b.site_id=x.site_id AND b.crawl_id=x.crawl_id
    JOIN page_snapshot source ON source.tenant_id=b.tenant_id AND source.site_id=b.site_id AND source.crawl_id=b.crawl_id AND source.id=b.page_snapshot_id
    WHERE x.tenant_id=$1 AND x.id=p.id AND x.seed_kind='link'
    AND EXISTS(SELECT 1 FROM record_link WHERE tenant_id=$1 AND owner_id=x.id AND field_name='provenance_ids' AND target_id=source.observation_id)
    AND EXISTS(SELECT 1 FROM record_link WHERE tenant_id=$1 AND owner_id=x.id AND field_name='provenance_ids' AND target_id=source.evidence_id)
    AND EXISTS(SELECT 1 FROM record_link WHERE tenant_id=$1 AND owner_id=x.id AND field_name='provenance_ids' AND target_id=b.bundle_id)
   UNION SELECT b.bundle_id FROM fixture_frontier_batch b WHERE b.tenant_id=$1 AND b.crawl_id=$3 AND b.sitemap_observation_id=p.id
   UNION SELECT d.parent_observation_id FROM fixture_sitemap_document d WHERE d.tenant_id=$1 AND d.crawl_id=$3 AND d.observation_id=p.id AND d.parent_observation_id IS NOT NULL
  ) next)
  SELECT id FROM refs LIMIT 10001`,[l.tenantId,roots,l.runId])).rows;
 if(closure.length>10000)throw new Error('source_graph_budget');
 const ids=closure.map(x=>x.id as string).sort();
 await assertInputsEligible(c,l.tenantId,l.siteId,l.runId,ids);
 const links=(await c.query('SELECT owner_id,field_name,ordinal,target_id,target_type FROM record_link WHERE tenant_id=$1 AND owner_id=ANY($2::uuid[]) ORDER BY owner_id,field_name,ordinal LIMIT 50001',[l.tenantId,ids])).rows;
 if(links.length>50000)throw new Error('source_graph_budget');
 const pinned=(owner:string,field:string,id:string)=>links.some(x=>x.owner_id===owner&&x.field_name===field&&x.target_id===id);
 if(!observationIds.every(id=>pinned(bundleId,'observation_ids',id))||!evidenceIds.every(id=>pinned(bundleId,'evidence_ids',id)))throw new Error('bundle_membership_required');
 const manifest={evidence_ids:links.filter(x=>x.owner_id===bundleId&&x.field_name==='evidence_ids').map(x=>x.target_id).sort(),observation_ids:links.filter(x=>x.owner_id===bundleId&&x.field_name==='observation_ids').map(x=>x.target_id).sort(),assertion_ids:links.filter(x=>x.owner_id===bundleId&&x.field_name==='assertion_ids').map(x=>x.target_id).sort(),known_at:new Date(bundle.known_at).toISOString(),known_seq:Number(bundle.known_seq)};
 if(manifestHash(manifest)!==bundle.manifest_hash)throw new Error('artifact_integrity_failed');
 if(![snapshot.observation_id,accepted.body_evidence_id,accepted.receipt_evidence_id].every(id=>pinned(snapshotId,'provenance_ids',id))||!pinned(snapshot.observation_id,'evidence_ids',accepted.body_evidence_id)||!pinned(snapshot.observation_id,'evidence_ids',accepted.receipt_evidence_id)||!pinned(scopeAcceptance.observation_id,'evidence_ids',scopeAcceptance.evidence_id))throw new Error('snapshot_context_invalid');
 for(const row of evidence){
  const limit=row.id===accepted.body_evidence_id?5242880:row.id===robotsAccepted.body_evidence_id?512000:65536;
  if(!Number.isSafeInteger(Number(row.bytes))||Number(row.bytes)<0||Number(row.bytes)>limit)throw new Error('source_budget');
 }
 const lineage=(await c.query(`SELECT i.id,i.record_type,to_jsonb(o) AS observation,to_jsonb(e) AS evidence FROM record_index i
 LEFT JOIN observation o ON o.tenant_id=i.tenant_id AND o.id=i.id LEFT JOIN evidence e ON e.tenant_id=i.tenant_id AND e.id=i.id
 WHERE i.tenant_id=$1 AND i.site_id=$2 AND i.id=ANY($3::uuid[]) AND i.record_type IN ('Observation','Evidence') ORDER BY i.id`,[...args,ids])).rows;
 if(!lineage.every(row=>pinned(bundleId,row.record_type==='Observation'?'observation_ids':'evidence_ids',row.id)))throw new Error('bundle_membership_required');
 if((await c.query(`SELECT 1 FROM observation WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND (deleted_at IS NOT NULL OR state NOT IN ('observed','partial') OR fresh_until<=clock_timestamp() OR observed_at>clock_timestamp() OR knowledge_seq>$3)
 UNION ALL SELECT 1 FROM evidence WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND (deleted_at IS NOT NULL OR state<>'available' OR expires_at<=clock_timestamp() OR knowledge_seq>$3) LIMIT 1`,[l.tenantId,ids,bundle.known_seq])).rowCount)throw new Error('source_unavailable');
 const ancestorTargets=(await c.query('SELECT * FROM crawl_target WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id',[l.tenantId,ids])).rows;
 const ancestorSnapshots=(await c.query('SELECT * FROM page_snapshot WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id',[l.tenantId,ids])).rows;
 if([...ancestorTargets,...ancestorSnapshots].some(row=>row.site_id!==l.siteId||row.crawl_id!==l.runId||row.deleted_at!==null||Number(row.knowledge_seq)>Number(bundle.known_seq))||ancestorTargets.some(row=>!row.admitted))throw new Error('snapshot_context_invalid');
 if(ancestorSnapshots.some(row=>(row.superseded_seq!==null&&Number(row.superseded_seq)<=Number(bundle.known_seq))||(row.id!==snapshotId&&(row.state!=='captured'||row.truncated))))throw new Error('snapshot_context_invalid');
 const ancestorBundles=(await c.query("SELECT * FROM evidence_bundle WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id",[l.tenantId,ids])).rows;
 if(ancestorBundles.some(row=>row.site_id!==l.siteId||row.state!=='frozen'||row.deleted_at!==null||Number(row.known_seq)>Number(bundle.known_seq)||(row.id!==bundleId&&Number(row.knowledge_seq)>Number(bundle.known_seq))))throw new Error('bundle_membership_required');
 const ambiguousLink=(await c.query(`SELECT x.id FROM crawl_target x LEFT JOIN fixture_link_batch b ON b.tenant_id=x.tenant_id AND b.site_id=x.site_id AND b.crawl_id=x.crawl_id
  AND EXISTS(SELECT 1 FROM record_link WHERE tenant_id=x.tenant_id AND owner_id=x.id AND field_name='provenance_ids' AND target_id=b.bundle_id)
  LEFT JOIN page_snapshot source ON source.tenant_id=b.tenant_id AND source.site_id=b.site_id AND source.crawl_id=b.crawl_id AND source.id=b.page_snapshot_id
  AND EXISTS(SELECT 1 FROM record_link WHERE tenant_id=x.tenant_id AND owner_id=x.id AND field_name='provenance_ids' AND target_id=source.observation_id)
  AND EXISTS(SELECT 1 FROM record_link WHERE tenant_id=x.tenant_id AND owner_id=x.id AND field_name='provenance_ids' AND target_id=source.evidence_id)
  WHERE x.tenant_id=$1 AND x.id=ANY($2::uuid[]) AND x.seed_kind='link' GROUP BY x.id HAVING count(source.id)<>1 LIMIT 1`,[l.tenantId,ids])).rowCount;
 if(ambiguousLink)throw new Error('snapshot_context_invalid');
 const sitemapDocuments=(await c.query('SELECT * FROM fixture_sitemap_document WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3 AND observation_id=ANY($4::uuid[]) ORDER BY observation_id',[...args,l.runId,ids])).rows;
 for(const ancestor of ancestorTargets.filter(row=>row.seed_kind==='sitemap')){
  const sourceIds=links.filter(row=>row.owner_id===ancestor.id&&row.field_name==='provenance_ids').map(row=>row.target_id);
  if(sitemapDocuments.filter(row=>sourceIds.includes(row.observation_id)).length!==1)throw new Error('snapshot_context_invalid');
 }
 const context={site,snapshot,page,target,bundle,scopeAcceptance,accepted,robotsAccepted,robotsObservationId,evidence,observations,links,ids,lineage,ancestorTargets,ancestorSnapshots,ancestorBundles,sitemapDocuments};
 return {...context,fingerprint:manifestHash(JSON.parse(JSON.stringify(context)))};
}
/** Validate exact retained raw/context bytes; decode once outside DB locks. */
export function prepareOfflineRenderSource(l:Lease,source:OfflineRenderSource,artifacts:Map<string,Buffer>):OfflineRenderPreparation{
 const raw=source.evidence.find(x=>x.id===source.accepted.body_evidence_id)!,context=source.evidence.find(x=>x.id===source.accepted.receipt_evidence_id)!;
 const obs=source.observations.find(x=>x.id===source.snapshot.observation_id)!;
 for(const row of source.evidence){const bytes=artifacts.get(row.id);if(!bytes||bytes.length!==Number(row.bytes)||hash(bytes)!==row.sha256)throw new Error('artifact_integrity_failed');}
 let receipt:any;
 try{receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(artifacts.get(context.id)!));}catch{throw new Error('artifact_integrity_failed');}
 validate(base+'http-receipt.schema.json',receipt);
 const snap=source.snapshot;
 if(obs.sensor_id!=='http-fixture'||obs.subject_id!==l.siteId||context.mime_type!=='application/json'||obs.context_hash!==context.sha256||receipt.body_evidence_id!==raw.id||receipt.method!=='GET'||receipt.status_code===null||receipt.status_code>=300&&receipt.status_code<400||receipt.status_code!==Number(snap.status_code)||receipt.truncated!==snap.truncated||receipt.url!==receipt.final_url||receipt.final_url!==source.page.url||raw.source_uri!==receipt.final_url||context.source_uri!==raw.source_uri||raw.sha256!==snap.content_hash||+new Date(snap.observed_at)!==+new Date(obs.observed_at)||+new Date(raw.captured_at)!==+new Date(obs.observed_at)||+new Date(context.captured_at)!==+new Date(obs.observed_at))throw new Error('snapshot_context_invalid');
 const contentTypes=receipt.headers.filter((h:{name:string})=>h.name.toLowerCase()==='content-type');
 if(contentTypes.length!==1||contentTypes[0].value.split(';',1)[0].trim().toLowerCase()!==raw.mime_type)throw new Error('snapshot_context_invalid');
 const prepared=receipt.error!==null||!snap.truncated&&(obs.state!=='observed'||snap.state!=='captured')?{state:'not_prepared' as const,reason:'incomplete_raw_snapshot' as const}:prepareOfflineRenderInput(artifacts.get(raw.id)!,{evidenceId:raw.id,sha256:raw.sha256,bytes:Number(raw.bytes),sourceUri:raw.source_uri,truncated:snap.truncated,contentType:contentTypes[0].value});
 return {source:{tenantId:l.tenantId,siteId:l.siteId,crawlId:l.runId,pageSnapshotId:snap.id,pageId:source.page.id,observationId:obs.id,rawEvidenceId:raw.id,receiptEvidenceId:context.id,bundleId:source.bundle.id,knownSeq:Number(source.bundle.known_seq)},prepared};
}
/** Existing scope/robots semantics, using only already-read memory bytes. */
export async function validateOfflineRenderScope(c:PoolClient,l:Lease,submittedBy:string,source:OfflineRenderSource,artifacts:Map<string,Buffer>,deletions:DeletionLedger){
 const ctx=await frontierContext(c,{tenantId:l.tenantId,userId:submittedBy},l.siteId,l.runId,source.bundle.id,source.robotsObservationId,deletions,{read:async(key,sha,size)=>{
  const row=source.evidence.find(x=>x.artifact_key===key&&x.sha256===sha&&Number(x.bytes)===size),bytes=row&&artifacts.get(row.id);
  if(!bytes)throw new Error('artifact_integrity_failed');return bytes;
 }});
 await ctx.assertInputs(source.ids);
 if(!pageAllowed(ctx.policy,source.page.url))throw new Error('robots_unavailable');
 await ctx.recheck();
}
