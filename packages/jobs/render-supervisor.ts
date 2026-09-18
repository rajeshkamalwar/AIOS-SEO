import type { Pool } from 'pg';
import { uuid } from '../contracts/index.js';
import { transaction } from '../persistence/transaction.js';
import type { Lease } from './index.js';
export interface RenderInvocationBinding {
 lease:Lease;reservationId:string;invocationId:string;processInstanceId:string;containerId:string;imageDigest:string;contextHash:string;startedAt:string;
}
export interface RenderTerminalReceipt extends RenderInvocationBinding {
 finishedAt:string;termination:'exited'|'killed';resultDigest:string;actualRequests:number|null;actualBytes:number|null;
}
function timestamp(value:string){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw new Error('invalid_input');}
function digest(value:string){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new Error('invalid_input');}
function params(input:RenderInvocationBinding){
 const l=input.lease;
 for(const value of [l.tenantId,l.siteId,l.runId,l.jobId,l.attemptId,l.token,input.reservationId,input.invocationId,input.processInstanceId])uuid(value);
 if(!Number.isSafeInteger(l.attempt)||l.attempt<1||l.attempt>3)throw new Error('invalid_input');
 timestamp(input.startedAt);digest(input.containerId);digest(input.imageDigest);digest(input.contextHash);
 return [l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,input.reservationId,input.invocationId,input.processInstanceId,input.containerId,input.imageDigest,input.contextHash,input.startedAt];
}
/** Independently authenticated local supervisor protocol, not a Docker process
 * producer. A worker response, elapsed timeout or lost lease is never terminal
 * proof. Fixture credentials remain separate from the scheduler and renderer. */
export class RenderSupervisor {
 constructor(private pool:Pool){}
 async bindInvocation(input:RenderInvocationBinding):Promise<void>{
  const values=params(input);
  await transaction(this.pool,'aios_render_supervisor',async c=>{await c.query('SELECT control.bind_render_invocation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',values);});
 }
 async recordTerminalReceipt(input:RenderTerminalReceipt):Promise<string>{
  const values=params(input);timestamp(input.finishedAt);digest(input.resultDigest);
  if(!['exited','killed'].includes(input.termination)||(input.actualRequests!==null&&(!Number.isSafeInteger(input.actualRequests)||input.actualRequests<0))||(input.actualBytes!==null&&(!Number.isSafeInteger(input.actualBytes)||input.actualBytes<0)))throw new Error('invalid_input');
  return transaction(this.pool,'aios_render_supervisor',async c=>{
   const result=await c.query('SELECT control.record_render_terminal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',[...values,input.finishedAt,input.termination,input.resultDigest,input.actualRequests,input.actualBytes]);
   return result.rows[0].record_render_terminal as string;
  });
 }
}
