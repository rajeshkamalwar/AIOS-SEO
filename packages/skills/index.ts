import type { Pool, PoolClient } from 'pg';
import { verify } from 'node:crypto';
import { base, canonical, manifestHash, validate, uuid } from '../contracts/index.js';
import { transaction, registryLock } from '../persistence/transaction.js';
import {assertHttpSeedManifest} from './http-seed.js';
import {assertHttpBootstrapManifest} from './http-bootstrap.js';
import {assertOfflineRenderManifest} from './offline-render.js';
export interface Approval { author:string; reviewer:string; manifest_digest:string; evaluation_digest:string; approved_at:string; scope:'local-synthetic-v1'; dependencies:string[] }
export class Registry {
 constructor(private pool:Pool){}
 async approve(manifest:Record<string,any>, approval:Approval, signature:string) {
  validate(base+'skill.schema.json',manifest);uuid(approval.author);uuid(approval.reviewer);
  const digest=manifestHash(manifest);
  if(approval.manifest_digest!==digest || approval.author===approval.reviewer || approval.scope!=='local-synthetic-v1' || !/^[a-f0-9]{64}$/.test(approval.evaluation_digest) || !Number.isFinite(Date.parse(approval.approved_at)) || Date.parse(approval.approved_at)>Date.now())throw new Error('approval_invalid');
  // Installing handlers is code deployment, never a manifest-controlled arbitrary operation.
  if(manifest.procedure.some((s:any)=>s.operation!=='reliability_v1')){if(manifest.procedure[0]?.operation==='http_bootstrap_fixture_v1')assertHttpBootstrapManifest(manifest);else if(manifest.procedure[0]?.operation==='http_seed_fixture_v1')assertHttpSeedManifest(manifest);else assertOfflineRenderManifest(manifest);}
  if(manifest.external_authority!=='read_only')throw new Error('handler_not_installed');
  if(Date.parse(manifest.freshness_deadline)<=Date.now() || Date.parse(manifest.last_verified)>Date.now())throw new Error('skill_stale');
  return transaction(this.pool,'aios_operator',async c=>{
   await c.query('SELECT pg_advisory_xact_lock($1)',[registryLock]);
   const key=(await c.query('SELECT public_key FROM control.authority_key WHERE reviewer=$1 AND active',[approval.reviewer])).rows[0];
   if(!key || !verify(null,Buffer.from(canonical(approval)),key.public_key,Buffer.from(signature,'base64')))throw new Error('approval_invalid');
   for(const dep of approval.dependencies) await eligible(c,dep,true);
   await c.query('INSERT INTO control.release VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[digest,manifest.skill_id,manifest.version,manifest,approval,signature,approval.scope,manifest.freshness_deadline]);
   for(const dep of approval.dependencies)await c.query('INSERT INTO control.release_dependency VALUES($1,$2)',[digest,dep]);
   await c.query("INSERT INTO control.release_state(digest,generation,status,reason) VALUES($1,1,'approved','independent_signed_evaluation')",[digest]);return digest;
  });
 }
 async change(digest:string,status:'deprecated'|'revoked',reason:string) {
  if(!['deprecated','revoked'].includes(status)|| !reason || reason.length>4096)throw new Error('invalid_input');
  return transaction(this.pool,'aios_operator',async c=>{
   await c.query('SELECT pg_advisory_xact_lock($1)',[registryLock]);
   const prior=(await c.query('SELECT generation,status FROM control.release_state WHERE digest=$1 ORDER BY generation DESC LIMIT 1',[digest])).rows[0];
   if(!prior || prior.status==='revoked')throw new Error('skill_revoked');
   await c.query('INSERT INTO control.release_state(digest,generation,status,reason) VALUES($1,$2,$3,$4)',[digest,Number(prior.generation)+1,status,reason]);
  });
 }
}
/** Caller holds registry shared lock until admission/dispatch/acceptance commits. */
export async function eligible(c:PoolClient,digest:string,admission:boolean):Promise<{digest:string;generation:number}[]> {
 if(!/^[a-f0-9]{64}$/.test(digest))throw new Error('schema_invalid');
 const rows=(await c.query(`WITH RECURSIVE deps(digest) AS (SELECT $1::text UNION SELECT d.dependency FROM control.release_dependency d JOIN deps ON d.digest=deps.digest)
 SELECT r.digest,r.manifest,r.fresh_until,r.approval,k.active,s.status,s.generation,clock_timestamp() AS now FROM deps
 JOIN control.release r ON r.digest=deps.digest LEFT JOIN control.authority_key k ON k.reviewer=(r.approval->>'reviewer')::uuid
 JOIN LATERAL(SELECT status,generation FROM control.release_state WHERE digest=r.digest ORDER BY generation DESC LIMIT 1)s ON true`,[digest])).rows;
 if(!rows.length)throw new Error('skill_unapproved');
 for(const r of rows){
  if(!r.active || r.status==='revoked')throw new Error('skill_revoked');
  if(admission && r.status!=='approved')throw new Error('skill_deprecated');
  if(new Date(r.fresh_until)<=new Date(r.now))throw new Error('skill_stale');
  if(manifestHash(r.manifest)!==r.digest || r.approval.scope!=='local-synthetic-v1')throw new Error('registry_integrity');
 }
 return rows.map(r=>({digest:r.digest,generation:Number(r.generation)}));
}
