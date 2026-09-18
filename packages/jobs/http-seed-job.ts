import type {Pool,PoolClient} from 'pg';
import type {LocalBlobs} from '../evidence/index.js';
import type {DeletionLedger} from '../policy/deletion.js';
import type {Lease} from './index.js';
import {base,validate,manifestHash} from '../contracts/index.js';
import {transaction} from '../persistence/transaction.js';
import {lockGovernedWork,requireLease} from './lease-context.js';
import {httpBootstrapSeedContext} from './http-bootstrap-seed.js';
import {readHttpBootstrapProjectionInput} from './http-bootstrap-projection.js';
import {validateHttpBootstrapScope} from './http-bootstrap-job.js';
import {assertHttpSeedRelease} from '../skills/http-seed.js';
import {pageAllowed} from '../perception/robots-admission.js';
export interface HttpSeedJobDescriptor {
 version:1;handler:'http_seed_fixture_v1';profile:'isolated-http-seed-fixture-v1';policy:'discovery-v1';parentJobId:string;parentAttemptId:string;parentAttempt:number;tenantId:string;siteId:string;crawlId:string;bundleId:string;knownSeq:number;targetId:string;targetVersion:number;bootstrapInvocationId:string;scopeObservationId:string;scopeEvidenceId:string;scopeSha256:string;robotsObservationId:string;robotsReceiptEvidenceId:string;robotsBodyEvidenceId:string|null;robotsContextHash:string;sourceContextHash:string;origin:string;url:string;method:'GET';maxDecodedBytes:5242880;timeoutMs:20000;
}
export async function httpSeedSource(c:PoolClient,parent:Lease,deletions:DeletionLedger){
 const s=await httpBootstrapSeedContext(c,parent,deletions);
 if(!s.prior||!s.projection.prior||s.prior.result.state!=='queued'||s.prior.result.admitted!==true||s.projection.prior.result.state!=='known')throw new Error('seed_not_admitted');
 // Operational target state changes only through a separately authenticated claim.
 const fingerprint=manifestHash({projection:s.projection.fingerprint,projectionResult:s.projection.prior.result,source:s.source.fingerprint,admission:s.prior});
 return {...s,stableFingerprint:fingerprint};
}
export function httpSeedDescriptor(l:Lease,s:Awaited<ReturnType<typeof httpSeedSource>>):HttpSeedJobDescriptor{
 const p=s.projection.prior.result;
 const d:HttpSeedJobDescriptor={version:1,handler:'http_seed_fixture_v1',profile:'isolated-http-seed-fixture-v1',policy:'discovery-v1',parentJobId:l.jobId,parentAttemptId:l.attemptId,parentAttempt:l.attempt,tenantId:l.tenantId,siteId:l.siteId,crawlId:l.runId,bundleId:s.prior.bundle_id,knownSeq:Number(s.bundle.known_seq),targetId:s.target.id,targetVersion:Number(s.prior.target_version),bootstrapInvocationId:s.prior.invocation_id,scopeObservationId:s.source.observation.id,scopeEvidenceId:s.source.evidence.id,scopeSha256:s.source.evidence.sha256,robotsObservationId:p.observationId,robotsReceiptEvidenceId:p.receiptEvidenceId,robotsBodyEvidenceId:p.bodyEvidenceId,robotsContextHash:p.contextHash,sourceContextHash:s.stableFingerprint,origin:s.source.site.normalized_origin,url:s.target.url,method:'GET',maxDecodedBytes:5242880,timeoutMs:20000};
 return d;
}
export async function readHttpSeedDescriptor(c:PoolClient,j:any):Promise<HttpSeedJobDescriptor>{
 const row=(await c.query('SELECT descriptor FROM http_seed_job WHERE tenant_id=$1 AND job_id=$2',[j.tenant_id,j.job_id])).rows[0];
 if(!row)throw new Error('handler_not_installed');validate(base+'http-seed-descriptor.schema.json',row.descriptor);
 if(manifestHash({descriptor:row.descriptor,release:j.release_digest,kind:'fetch',policy:'discovery-v1'})!==j.expected_input_hash)throw new Error('source_context_changed');return row.descriptor;
}
export async function httpSeedParent(c:PoolClient,l:Lease,d:HttpSeedJobDescriptor):Promise<Lease>{
 const h=(await c.query('SELECT * FROM http_reservation WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3 AND job_id=$4 AND invocation_id=$5 AND attempt_no=$6 AND attempt_id=$7',[l.tenantId,l.siteId,l.runId,d.parentJobId,d.bootstrapInvocationId,d.parentAttempt,d.parentAttemptId])).rows[0];
 if(!h)throw new Error('source_unavailable');return {...l,jobId:d.parentJobId,attempt:d.parentAttempt,attemptId:d.parentAttemptId,token:h.lease_token};
}
export async function assertHttpSeedContext(c:PoolClient,l:Lease,deletions:DeletionLedger){
 await lockGovernedWork(c);const {j}=await requireLease(c,l,deletions);if(j.kind!=='fetch')throw new Error('handler_not_installed');await assertHttpSeedRelease(c,j.release_digest);
 const d=await readHttpSeedDescriptor(c,j),parent=await httpSeedParent(c,l,d),s=await httpSeedSource(c,parent,deletions);
 const current=httpSeedDescriptor(parent,s);
 if(manifestHash(current)!==manifestHash(d))throw new Error('source_context_changed');
 const claim=(await c.query('SELECT * FROM http_seed_claim WHERE tenant_id=$1 AND target_id=$2',[l.tenantId,d.targetId])).rows[0];
 if(claim){if(claim.job_id!==l.jobId||claim.attempt_no!==l.attempt||claim.attempt_id!==l.attemptId||claim.lease_token!==l.token||s.target.state!=='fetching'||!s.target.admitted||Number(s.target.version)!==d.targetVersion+1||Number(s.target.attempts)!==1)throw new Error('target_claimed');}
 else if(s.target.state!=='queued'||!s.target.admitted||Number(s.target.version)!==d.targetVersion||Number(s.target.attempts)!==0)throw new Error('target_unavailable');
 return {descriptor:d,parent,source:s};
}
export async function prepareHttpSeedSource(pool:Pool,deletions:DeletionLedger,blobs:Pick<LocalBlobs,'read'>|undefined,parent:Lease){
 if(!blobs)throw new Error('artifact_adapter_required');
 const initial=await transaction(pool,'aios_scheduler',c=>httpSeedSource(c,parent,deletions));
 const scope=await blobs.read(initial.source.evidence.artifact_key,initial.source.evidence.sha256,Number(initial.source.evidence.bytes));validateHttpBootstrapScope(initial.source,scope,parent);
 const parsed=await readHttpBootstrapProjectionInput(pool,deletions,blobs,parent);
 if(parsed.initial.fingerprint!==initial.projection.fingerprint||manifestHash(parsed.result)!==manifestHash(initial.projection.prior.result)||parsed.decision.state!=='known'||!pageAllowed(parsed.decision,initial.target.url))throw new Error('scope_denied');
 const current=await transaction(pool,'aios_scheduler',c=>httpSeedSource(c,parent,deletions));if(current.stableFingerprint!==initial.stableFingerprint)throw new Error('source_context_changed');return current;
}
