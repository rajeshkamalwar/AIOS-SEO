import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { uuid } from '../contracts/index.js';
import { transaction } from '../persistence/transaction.js';
import { DeletionLedger } from '../policy/deletion.js';
import { lockGovernedWork,requireLease } from './lease-context.js';
import { resolveOfflineRenderSource } from './offline-render-source.js';
import type { Lease } from './index.js';
export interface RenderReservationInput {pageSnapshotId:string;bundleId:string;inputSha256:string;profile:'local-offline-replay-v3'}
export interface RenderReservation extends RenderReservationInput {
 reservationId:string;invocationId:string;sourceContextHash:string;reservedPages:1;maxRequests:100;maxBytes:10485760;startedAt:string;state:'reserved'|'settled';
}
/** Durable local accounting only. inputSha256 is an immutable caller assertion,
 * not authentication of HTML bytes or authorization to run a renderer. The
 * future producer must independently prepare/compare/recheck before GO. */
export class RenderLane {
 constructor(private pool:Pool,private deletions:DeletionLedger){}
 async reserve(l:Lease,input:RenderReservationInput):Promise<RenderReservation>{
  if(!input||Object.keys(input).sort().join(',')!=='bundleId,inputSha256,pageSnapshotId,profile'||input.profile!=='local-offline-replay-v3'||typeof input.inputSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.inputSha256))throw new Error('invalid_input');
  uuid(input.pageSnapshotId);uuid(input.bundleId);
  return transaction(this.pool,'aios_scheduler',async c=>{
   await lockGovernedWork(c);const {j}=await requireLease(c,l,this.deletions);
   if(j.kind!=='project')throw new Error('handler_not_installed');
   if(j.input_ref!==input.bundleId)throw new Error('bundle_membership_required');
   const source=await resolveOfflineRenderSource(c,l,input.bundleId,input.pageSnapshotId);
   const url=new URL(source.page.url),raw=source.evidence.find(row=>row.id===source.snapshot.evidence_id);
   if(source.snapshot.state!=='captured'||source.snapshot.truncated||raw?.mime_type!=='text/html'||url.protocol!=='https:'||!url.hostname.endsWith('.example'))throw new Error('snapshot_unavailable');
   const row=(await c.query('SELECT * FROM control.reserve_render_accounting($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,input.pageSnapshotId,input.bundleId,input.inputSha256,input.profile,source.fingerprint,randomUUID()])).rows[0];
   return {reservationId:row.reservation_id,invocationId:row.invocation_id,pageSnapshotId:row.page_snapshot_id,bundleId:row.bundle_id,inputSha256:row.input_sha256,profile:row.profile,sourceContextHash:row.source_context_hash,reservedPages:1,maxRequests:100,maxBytes:10485760,startedAt:new Date(row.started_at).toISOString(),state:row.settled_at===null?'reserved':'settled'};
  });
 }
 async settle(l:Lease,reservationId:string,receiptId:string):Promise<void>{
  for(const value of [l.tenantId,l.siteId,l.runId,l.jobId,l.attemptId,l.token,reservationId,receiptId])uuid(value);
  if(!Number.isSafeInteger(l.attempt)||l.attempt<1||l.attempt>3)throw new Error('invalid_input');
  return transaction(this.pool,'aios_scheduler',async c=>{
   await lockGovernedWork(c);
   await c.query('SELECT control.settle_render_terminal($1,$2,$3,$4,$5,$6,$7,$8,$9)',[l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,reservationId,receiptId]);
  });
 }
}
