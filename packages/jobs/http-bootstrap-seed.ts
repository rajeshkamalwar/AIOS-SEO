import type {Pool,PoolClient} from 'pg';
import type {LocalBlobs} from '../evidence/index.js';
import type {DeletionLedger} from '../policy/deletion.js';
import {base,validate,manifestHash} from '../contracts/index.js';
import {transaction} from '../persistence/transaction.js';
import {assertInputsEligible} from '../policy/input-eligibility.js';
import {pageAllowed} from '../perception/robots-admission.js';
import {httpBootstrapProjectionContext,readHttpBootstrapProjectionInput} from './http-bootstrap-projection.js';
import {resolveHttpBootstrapSource,validateHttpBootstrapScope} from './http-bootstrap-job.js';
import type {Lease} from './index.js';
export interface HttpBootstrapSeedAdmission {invocationId:string;observationId:string;targetId:string;bundleId:string;state:'queued'|'excluded'|'deferred';admitted:boolean;reason:null|'robots_disallowed'|'robots_denied'|'robots_unknown'|'admission_budget';policyVersion:'discovery-v1'}
/** Classifies only the submitted seed from a completed local bootstrap. No fetch. */
export async function admitHttpBootstrapSeed(pool:Pool,deletions:DeletionLedger,blobs:Pick<LocalBlobs,'read'>|undefined,lease:Lease):Promise<HttpBootstrapSeedAdmission>{
 const l={...lease};if(!blobs)throw new Error('artifact_adapter_required');
 const gate=async(c:PoolClient)=>{
  const projection=await httpBootstrapProjectionContext(c,l,deletions);if(!projection.prior)throw new Error('bootstrap_incomplete');
  const source=await resolveHttpBootstrapSource(c,l,projection.descriptor.bundleId);
  const targets=(await c.query("SELECT * FROM crawl_target WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3 AND seed_kind='submitted' AND deleted_at IS NULL",[l.tenantId,l.siteId,l.runId])).rows;
  if(targets.length!==1)throw new Error('seed_unavailable');const target=targets[0];
  if(target.url!==source.site.submitted_url||target.url_key!==target.url||Number(target.depth)!==0||target.discovered_from_id!==null)throw new Error('source_context_changed');
  const prior=(await c.query('SELECT * FROM http_bootstrap_seed_admission WHERE tenant_id=$1 AND crawl_id=$2',[l.tenantId,l.runId])).rows[0];
  if(prior){if(prior.job_id!==l.jobId||prior.invocation_id!==projection.accepted.invocation_id||prior.target_id!==target.id)throw new Error('conflict');}
  else if(target.state!=='discovered'||target.admitted||Number(target.attempts)!==0)throw new Error('seed_already_classified');
  const targetLinks=(await c.query("SELECT field_name,ordinal,target_id,target_type FROM record_link WHERE tenant_id=$1 AND owner_id=$2 ORDER BY field_name,ordinal",[l.tenantId,target.id])).rows;
  if(!prior&&targetLinks.length)throw new Error('seed_already_classified');
  if(prior){
   if(Number(target.version)<Number(prior.target_version)||targetLinks.length!==3||![[source.observation.id,'Observation'],[projection.observation.id,'Observation'],[prior.bundle_id,'EvidenceBundle']].every(([id,type],ordinal)=>targetLinks.some(x=>x.field_name==='provenance_ids'&&x.ordinal===ordinal&&x.target_id===id&&x.target_type===type)))throw new Error('artifact_integrity_failed');
  }
  if((await c.query('SELECT 1 FROM fixture_frontier_batch WHERE tenant_id=$1 AND crawl_id=$2 AND robots_observation_id<>$3 UNION ALL SELECT 1 FROM fixture_link_batch WHERE tenant_id=$1 AND crawl_id=$2 AND robots_observation_id<>$3 LIMIT 1',[l.tenantId,l.runId,projection.observation.id])).rowCount)throw new Error('robots_context_conflict');
  let bundle:any=null,bundleLinks:any[]=[];
  if(prior){
   bundle=(await c.query("SELECT * FROM evidence_bundle WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND state='frozen' AND deleted_at IS NULL",[l.tenantId,l.siteId,prior.bundle_id])).rows[0];
   if(!bundle)throw new Error('source_unavailable');
   bundleLinks=(await c.query('SELECT field_name,ordinal,target_id FROM record_link WHERE tenant_id=$1 AND owner_id=$2 ORDER BY field_name,ordinal',[l.tenantId,bundle.id])).rows;
   const evidenceIds=[source.evidence.id,...projection.artifacts.map(x=>x.id)].sort(),observationIds=[source.observation.id,projection.observation.id].sort();
   const actualEvidence=bundleLinks.filter(x=>x.field_name==='evidence_ids').map(x=>x.target_id).sort(),actualObservations=bundleLinks.filter(x=>x.field_name==='observation_ids').map(x=>x.target_id).sort();
   const manifest={evidence_ids:actualEvidence,observation_ids:actualObservations,assertion_ids:[],known_seq:Number(bundle.known_seq),known_at:new Date(bundle.known_at).toISOString()};
   if(manifestHash(evidenceIds)!==manifestHash(actualEvidence)||manifestHash(observationIds)!==manifestHash(actualObservations)||bundleLinks.some(x=>!['evidence_ids','observation_ids'].includes(x.field_name))||manifestHash(manifest)!==bundle.manifest_hash||[source.evidence,source.observation,...projection.artifacts,projection.observation].some(x=>Number(x.knowledge_seq)>Number(bundle.known_seq)))throw new Error('artifact_integrity_failed');
   const cutoff=(await c.query('SELECT recorded_at FROM knowledge_commit WHERE tenant_id=$1 AND seq=$2',[l.tenantId,bundle.known_seq])).rows[0];
   if(!cutoff||+new Date(cutoff.recorded_at)!==+new Date(bundle.known_at))throw new Error('invalid_cutoff');
  }
  await assertInputsEligible(c,l.tenantId,l.siteId,l.runId,[target.id,...(prior?[prior.bundle_id]:[])]);
  const context={projection:projection.fingerprint,source:source.fingerprint,target,targetLinks,bundle,bundleLinks};
  return {projection,source,target,prior,fingerprint:manifestHash(JSON.parse(JSON.stringify(context)))};
 };
 const initial=await transaction(pool,'aios_scheduler',gate);
 const scopeBytes=await blobs.read(initial.source.evidence.artifact_key,initial.source.evidence.sha256,Number(initial.source.evidence.bytes));validateHttpBootstrapScope(initial.source,scopeBytes,l);
 const parsed=await readHttpBootstrapProjectionInput(pool,deletions,blobs,l);
 if(parsed.initial.fingerprint!==initial.projection.fingerprint||manifestHash(parsed.result)!==manifestHash(initial.projection.prior.result))throw new Error('source_context_changed');
 const policy=parsed.decision;
 const disposition=policy.state==='known'?(pageAllowed(policy,initial.target.url)?'allowed':'disallowed'):policy.state;
 return transaction(pool,'aios_scheduler',async c=>{
  const current=await gate(c);if(current.fingerprint!==initial.fingerprint&&!(current.prior&&!initial.prior&&current.projection.fingerprint===initial.projection.fingerprint&&current.source.fingerprint===initial.source.fingerprint))throw new Error('source_context_changed');
  const row=(await c.query('SELECT * FROM control.admit_http_bootstrap_seed($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,initial.target.id,initial.target.version,disposition,initial.projection.prior.receipt_hash])).rows[0];
  validate(base+'http-bootstrap-seed-admission.schema.json',row.result);return row.result;
 });
}
