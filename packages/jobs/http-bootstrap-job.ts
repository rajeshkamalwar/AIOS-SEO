import type {PoolClient} from 'pg';
import {base,validate,canonical,hash,manifestHash} from '../contracts/index.js';
import {assertInputsEligible} from '../policy/input-eligibility.js';
import {assertReviewedFixtureUrl} from '../perception/reviewed-fixtures.js';
import type {Lease} from './index.js';
export interface HttpBootstrapJobDescriptor {
 version:1;handler:'http_bootstrap_fixture_v1';profile:'isolated-http-fixture-v1';policy:'discovery-v1';
 parentJobId:string;parentAttemptId:string;parentAttempt:number;tenantId:string;siteId:string;crawlId:string;bundleId:string;knownSeq:number;
 scopeObservationId:string;scopeEvidenceId:string;scopeSha256:string;sourceContextHash:string;
 origin:string;url:string;method:'GET';maxDecodedBytes:512000;timeoutMs:20000;
}
export async function resolveHttpBootstrapSource(c:PoolClient,l:Lease,bundleId:string){
 const site=(await c.query('SELECT * FROM site WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL',[l.tenantId,l.siteId])).rows[0];
 const run=(await c.query("SELECT r.*,t.deletion_epoch,t.policy_profile_id FROM crawl r JOIN tenant t ON t.id=r.tenant_id WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.id=$3",[l.tenantId,l.siteId,l.runId])).rows[0];
 if(!site||!run||run.policy_profile_id!=='local-synthetic-v1'||run.policy_version!=='discovery-v1')throw new Error('policy_blocked');
 assertReviewedFixtureUrl(site.submitted_url);assertReviewedFixtureUrl(site.normalized_origin+'/');
 if(new URL(site.submitted_url).origin!==site.normalized_origin)throw new Error('scope_denied');
 const bundle=(await c.query("SELECT * FROM evidence_bundle WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND state='frozen' AND deleted_at IS NULL",[l.tenantId,l.siteId,bundleId])).rows[0];
 if(!bundle)throw new Error('bundle_membership_required');
 const accepted=(await c.query('SELECT * FROM site_scope_acceptance WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3',[l.tenantId,l.siteId,l.runId])).rows[0];
 if(!accepted)throw new Error('scope_receipt_required');
 const evidence=(await c.query("SELECT * FROM evidence WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND state='available' AND deleted_at IS NULL AND expires_at>clock_timestamp() AND captured_at<=clock_timestamp() AND knowledge_seq<=$4",[l.tenantId,l.siteId,accepted.evidence_id,bundle.known_seq])).rows[0];
 const observation=(await c.query("SELECT * FROM observation WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND state='observed' AND deleted_at IS NULL AND fresh_until>clock_timestamp() AND observed_at<=clock_timestamp() AND knowledge_seq<=$4",[l.tenantId,l.siteId,accepted.observation_id,bundle.known_seq])).rows[0];
 const links=(await c.query('SELECT owner_id,field_name,target_id FROM record_link WHERE tenant_id=$1 AND owner_id=ANY($2::uuid[]) ORDER BY owner_id,field_name,target_id',[l.tenantId,[bundleId,accepted.observation_id]])).rows;
 const manifest={evidence_ids:links.filter(x=>x.owner_id===bundleId&&x.field_name==='evidence_ids').map(x=>x.target_id).sort(),observation_ids:links.filter(x=>x.owner_id===bundleId&&x.field_name==='observation_ids').map(x=>x.target_id).sort(),assertion_ids:links.filter(x=>x.owner_id===bundleId&&x.field_name==='assertion_ids').map(x=>x.target_id).sort(),known_at:new Date(bundle.known_at).toISOString(),known_seq:Number(bundle.known_seq)};
 if(manifestHash(manifest)!==bundle.manifest_hash)throw new Error('artifact_integrity_failed');
 const has=(owner:string,field:string,id:string)=>links.some(x=>x.owner_id===owner&&x.field_name===field&&x.target_id===id);
 if(!has(bundleId,'evidence_ids',accepted.evidence_id)||!has(bundleId,'observation_ids',accepted.observation_id))throw new Error('bundle_membership_required');
 if(!evidence||!observation||!has(observation.id,'evidence_ids',evidence.id)||evidence.source_class!=='internal_policy'||evidence.mime_type!=='application/json'||evidence.source_uri!==site.submitted_url||observation.sensor_id!=='site-scope'||observation.subject_id!==l.runId||observation.context_hash!==evidence.sha256)throw new Error('scope_receipt_invalid');
 await assertInputsEligible(c,l.tenantId,l.siteId,l.runId,[l.siteId,l.runId,bundleId,evidence.id,observation.id]);
 // Exclude mutable run scheduling/state fields; authority is independently rechecked.
 const context={site,bundle,accepted,evidence,observation,links,run:{submitted_by:run.submitted_by,deadline:run.budget.deadline,deletion_epoch:run.deletion_epoch,policy:run.policy_version,profile:run.policy_profile_id}};
 return {...context,fingerprint:manifestHash(JSON.parse(JSON.stringify(context)))};
}
export function validateHttpBootstrapScope(source:Awaited<ReturnType<typeof resolveHttpBootstrapSource>>,bytes:Buffer,l:Lease){
 if(hash(bytes)!==source.evidence.sha256||bytes.length!==Number(source.evidence.bytes))throw new Error('artifact_integrity_failed');
 const receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));validate(base+'scope-receipt.schema.json',receipt);
 if(!bytes.equals(Buffer.from(canonical(receipt))))throw new Error('unreviewed_fixture');
 assertReviewedFixtureUrl(receipt.submitted_url);assertReviewedFixtureUrl(receipt.normalized_origin+'/');
 if(receipt.tenant_id!==l.tenantId||receipt.site_id!==l.siteId||receipt.crawl_id!==l.runId||receipt.submitted_by!==source.run.submitted_by||receipt.submitted_url!==source.site.submitted_url||receipt.normalized_origin!==source.site.normalized_origin||receipt.site_version!==Number(source.site.version)||receipt.deletion_epoch!==Number(source.run.deletion_epoch)||Date.parse(receipt.expires_at)!==Date.parse(source.run.deadline))throw new Error('scope_receipt_invalid');
}
export function httpBootstrapDescriptor(l:Lease,s:Awaited<ReturnType<typeof resolveHttpBootstrapSource>>):HttpBootstrapJobDescriptor{
 return {version:1,handler:'http_bootstrap_fixture_v1',profile:'isolated-http-fixture-v1',policy:'discovery-v1',parentJobId:l.jobId,parentAttemptId:l.attemptId,parentAttempt:l.attempt,tenantId:l.tenantId,siteId:l.siteId,crawlId:l.runId,bundleId:s.bundle.id,knownSeq:Number(s.bundle.known_seq),scopeObservationId:s.observation.id,scopeEvidenceId:s.evidence.id,scopeSha256:s.evidence.sha256,sourceContextHash:s.fingerprint,origin:s.site.normalized_origin,url:s.site.normalized_origin+'/robots.txt',method:'GET',maxDecodedBytes:512000,timeoutMs:20000};
}
export async function readHttpBootstrapDescriptor(c:PoolClient,j:any):Promise<HttpBootstrapJobDescriptor>{
 const row=(await c.query('SELECT descriptor FROM http_bootstrap_job WHERE tenant_id=$1 AND job_id=$2',[j.tenant_id,j.job_id])).rows[0];
 if(!row||manifestHash({descriptor:row.descriptor,release:j.release_digest,kind:'fetch',policy:'discovery-v1'})!==j.expected_input_hash)throw new Error('source_context_changed');return row.descriptor;
}
