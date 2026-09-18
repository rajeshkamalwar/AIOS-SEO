import type { Pool } from 'pg';
import { uuid } from '../contracts/index.js';
import { transaction } from '../persistence/transaction.js';
import type { Lease } from './index.js';
export interface HttpInvocationBinding {
 lease:Lease; reservationId:string; invocationId:string; processInstanceId:string;
 collectorBuildDigest:string; inputContextHash:string; startedAt:string;
}
export interface HttpTerminalReceipt extends HttpInvocationBinding {
 finishedAt:string; termination:'exited'|'killed'; resultDigest:string; actualDecodedBytes:number|null;
}
function timestamp(value:string){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw new Error('invalid_input');
}
function digest(value:string){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new Error('invalid_input');}
function params(input:HttpInvocationBinding){
 const l=input.lease;
 for(const value of [l.tenantId,l.siteId,l.runId,l.jobId,l.attemptId,l.token,input.reservationId,input.invocationId,input.processInstanceId])uuid(value);
 if(!Number.isSafeInteger(l.attempt)||l.attempt<1||l.attempt>3)throw new Error('invalid_input');
 timestamp(input.startedAt);digest(input.collectorBuildDigest);digest(input.inputContextHash);
 return [l.tenantId,l.siteId,l.runId,l.jobId,l.attempt,l.attemptId,l.token,input.reservationId,input.invocationId,input.processInstanceId,input.collectorBuildDigest,input.inputContextHash,input.startedAt];
}
/** Trusted supervisor protocol only. Worker output, a timeout or a scheduler lease
 * is not termination proof. The local fixture caller holds separate credentials;
 * an actual process/egress termination producer is not installed by this adapter. */
export class HttpSupervisor {
 constructor(private pool:Pool){}
 async bindInvocation(input:HttpInvocationBinding):Promise<void>{
  const values=params(input);
  await transaction(this.pool,'aios_http_supervisor',async c=>{
   await c.query('SELECT control.bind_http_invocation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',values);
  });
 }
 async recordTerminalReceipt(input:HttpTerminalReceipt):Promise<string>{
  const values=params(input);timestamp(input.finishedAt);digest(input.resultDigest);
  if(!['exited','killed'].includes(input.termination)||(input.actualDecodedBytes!==null&&(!Number.isSafeInteger(input.actualDecodedBytes)||input.actualDecodedBytes<0)))throw new Error('invalid_input');
  return transaction(this.pool,'aios_http_supervisor',async c=>{
   const r=await c.query('SELECT control.record_http_terminal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) AS id',[...values,input.finishedAt,input.termination,input.resultDigest,input.actualDecodedBytes]);
   return r.rows[0].id as string;
  });
 }
}
