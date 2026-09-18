import {assertReviewedFixtureUrl,assertReviewedRawFixture,assertReviewedHttpFixtureMetadata} from '../perception/reviewed-fixtures.js';
import type { PoolClient } from 'pg';
import { base,validate,hash,canonical } from '../contracts/index.js';
import type { Principal } from '../persistence/index.js';
import { scope,registryLock,workLock } from '../persistence/transaction.js';
import type { LocalBlobs } from '../evidence/index.js';
import { DeletionLedger } from '../policy/deletion.js';
import { robotsState } from '../perception/robots-admission.js';
import { assertInputsEligible } from '../policy/input-eligibility.js';
/** Transaction-internal fixture evidence gates shared by deterministic frontier projections. */
export async function frontierContext(c:PoolClient,p:Principal,site:string,run:string,bundleId:string,robotsObservationId:string,deletions:DeletionLedger,artifacts:Pick<LocalBlobs,'read'>){
 if(!(deletions instanceof DeletionLedger))throw new Error('deletion_adapter_required');
   await c.query('SELECT pg_advisory_xact_lock_shared($1)',[registryLock]);await c.query('SELECT pg_advisory_xact_lock($1)',[workLock]);
   const current=async()=>{
    await scope(c,p,site);if(await deletions.contains(p.tenantId,site))throw new Error('deleted_scope');
    const r=(await c.query(`SELECT r.*,f.quarantined,f.deletion_epoch AS pinned_epoch,t.deletion_epoch,t.policy_profile_id,s.submitted_url,s.normalized_origin,s.version AS site_version
     FROM crawl r JOIN work_fence f ON f.tenant_id=r.tenant_id AND f.crawl_id=r.id JOIN tenant t ON t.id=r.tenant_id JOIN site s ON s.tenant_id=r.tenant_id AND s.id=r.site_id
     WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.id=$3 FOR UPDATE OF r`,[p.tenantId,site,run])).rows[0];
    if(!r||r.submitted_by!==p.userId)throw new Error('scope_denied');
    if(!['queued','running'].includes(r.state)||r.quarantined||r.pinned_epoch!==r.deletion_epoch)throw new Error('run_fenced');
    if(r.policy_profile_id!=='local-synthetic-v1'||r.policy_version!=='discovery-v1'||!(await c.query("SELECT 1 FROM control.health WHERE singleton AND policy_version='discovery-v1' AND restore_ready AND verified_until>clock_timestamp() AND clock_timestamp()<$1::timestamptz",[r.budget.deadline])).rowCount)throw new Error('policy_unavailable');
    return r;
   };
   const r=await current();
   const inputIds=new Set<string>([bundleId,run,site]);
   const assertInputs=async(ids:readonly string[]=[])=>{
    for(const id of ids)inputIds.add(id);
    await assertInputsEligible(c,p.tenantId,site,run,[...inputIds]);
   };
   if((await c.query('SELECT 1 FROM fixture_frontier_batch WHERE tenant_id=$1 AND crawl_id=$2 AND robots_observation_id<>$3 UNION ALL SELECT 1 FROM fixture_link_batch WHERE tenant_id=$1 AND crawl_id=$2 AND robots_observation_id<>$3 LIMIT 1',[p.tenantId,run,robotsObservationId])).rowCount)throw new Error('robots_context_conflict');
   const bundle=(await c.query("SELECT * FROM evidence_bundle WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND state='frozen'",[p.tenantId,site,bundleId])).rows[0];
   if(!bundle)throw new Error('bundle_membership_required');
   await assertInputs();
   const links=(await c.query('SELECT field_name,target_id FROM record_link WHERE tenant_id=$1 AND owner_id=$2',[p.tenantId,bundleId])).rows;
   const pinned=(field:string,id:string)=>links.some(l=>l.field_name===field&&l.target_id===id);
   const observation=async(id:string)=>{
    await assertInputs([id]);
    observationIds.add(id);
    if(!pinned('observation_ids',id))throw new Error('bundle_membership_required');
    const row=(await c.query("SELECT * FROM observation WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND knowledge_seq<=$4 AND fresh_until>clock_timestamp() AND observed_at<=clock_timestamp() AND state='observed'",[p.tenantId,site,id,bundle.known_seq])).rows[0];
    if(!row)throw new Error('source_unavailable');return row;
   };
   const evidenceIds:string[]=[],observationIds=new Set<string>();
   const evidence=async(id:string)=>{
    await assertInputs([id]);
    evidenceIds.push(id);
    if(!pinned('evidence_ids',id))throw new Error('bundle_membership_required');
    const row=(await c.query("SELECT * FROM evidence WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND knowledge_seq<=$4 AND state='available' AND expires_at>clock_timestamp()",[p.tenantId,site,id,bundle.known_seq])).rows[0];
    if(!row)throw new Error('source_unavailable');
    const bytes=await artifacts.read(row.artifact_key,row.sha256,Number(row.bytes));
    if(hash(bytes)!==row.sha256||bytes.length!==Number(row.bytes))throw new Error('artifact_integrity_failed');return {row,bytes};
   };
   const acceptedScope=(await c.query('SELECT * FROM site_scope_acceptance WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3',[p.tenantId,site,run])).rows[0];
   if(!acceptedScope)throw new Error('scope_receipt_required');
   const scopeObservation=await observation(acceptedScope.observation_id),scopeEvidence=await evidence(acceptedScope.evidence_id);
   const receipt=JSON.parse(scopeEvidence.bytes.toString('utf8'));validate(base+'scope-receipt.schema.json',receipt);
   if(!scopeEvidence.bytes.equals(Buffer.from(canonical(receipt))))throw new Error('unreviewed_fixture');
   assertReviewedFixtureUrl(receipt.submitted_url);assertReviewedFixtureUrl(receipt.normalized_origin+'/');
   if(scopeEvidence.row.source_class!=='internal_policy'||scopeObservation.sensor_id!=='site-scope'||scopeObservation.subject_id!==run||scopeObservation.context_hash!==hash(scopeEvidence.bytes)||receipt.tenant_id!==p.tenantId||receipt.site_id!==site||receipt.crawl_id!==run||receipt.submitted_by!==p.userId||receipt.submitted_url!==r.submitted_url||receipt.normalized_origin!==r.normalized_origin||receipt.site_version!==Number(r.site_version)||receipt.deletion_epoch!==Number(r.deletion_epoch)||Date.parse(receipt.expires_at)!==Date.parse(r.budget.deadline))throw new Error('scope_receipt_invalid');
   const http=async(id:string)=>{
    const obs=await observation(id);if(obs.sensor_id!=='http-fixture')throw new Error('source_unavailable');
    const accepted=(await c.query('SELECT * FROM http_fixture_acceptance WHERE tenant_id=$1 AND site_id=$2 AND observation_id=$3',[p.tenantId,site,id])).rows[0];
    if(!accepted)throw new Error('source_unavailable');
    const context=await evidence(accepted.receipt_evidence_id),value=JSON.parse(context.bytes.toString('utf8'));validate(base+'http-receipt.schema.json',value);
    if(!context.bytes.equals(Buffer.from(canonical(value))))throw new Error('unreviewed_fixture');
    const {body_evidence_id:_body,...metadata}=value;assertReviewedHttpFixtureMetadata(metadata);
    const body=accepted.body_evidence_id?await evidence(accepted.body_evidence_id):null;
    if(body)assertReviewedRawFixture({mimeType:body.row.mime_type,sourceUri:body.row.source_uri,bytes:body.bytes});
    if(context.row.mime_type!=='application/json'||obs.context_hash!==hash(context.bytes)||value.body_evidence_id!==accepted.body_evidence_id||value.error!==null||value.truncated||value.method!=='GET'||value.url!==value.final_url||value.final_url!==context.row.source_uri||new URL(value.final_url).origin!==r.normalized_origin||body&&body.row.source_uri!==value.final_url)throw new Error('source_unavailable');
    const provenance=(await c.query("SELECT target_id FROM record_link WHERE tenant_id=$1 AND owner_id=$2 AND field_name='evidence_ids'",[p.tenantId,id])).rows.map(x=>x.target_id);
    if(!provenance.includes(accepted.receipt_evidence_id)||body&&!provenance.includes(accepted.body_evidence_id))throw new Error('source_unavailable');
    return {value,body,obs,context};
   };
   const robots=await http(robotsObservationId);
   if(robots.body&&robots.body.bytes.length>512000||!(await c.query("SELECT 1 WHERE $1::timestamptz>clock_timestamp()-interval '24 hours'",[robots.obs.observed_at])).rowCount)throw new Error('robots_unavailable');
   if(robots.value.url!==r.normalized_origin+'/robots.txt')throw new Error('robots_source_invalid');
   const policy=robotsState({status:robots.value.status_code,body:robots.body?.bytes??null,truncated:robots.value.truncated});
   if(policy.state!=='known')throw new Error('robots_unavailable');
   const recheck=async()=>{
   await current();
   await assertInputs();
   for(const id of observationIds)await observation(id);
   if(!(await c.query("SELECT 1 WHERE $1::timestamptz>clock_timestamp()-interval '24 hours'",[robots.obs.observed_at])).rowCount||
      (await c.query("SELECT count(*)::integer AS count FROM evidence WHERE tenant_id=$1 AND site_id=$2 AND id=ANY($3::uuid[]) AND state='available' AND expires_at>clock_timestamp()",[p.tenantId,site,[...new Set(evidenceIds)]])).rows[0].count!==new Set(evidenceIds).size)throw new Error('source_unavailable');
   };
   return {r,bundle,acceptedScope,http,policy,recheck,current,assertInputs};
}
