import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { base, validate, uuid } from '../contracts/index.js';
import type { Principal } from './index.js';
export type ServiceRole = 'aios_runtime'|'aios_scheduler'|'aios_evaluator'|'aios_operator'|'aios_http_supervisor' | 'aios_render_supervisor';
export const registryLock = 68273432, workLock = 68273433;
export async function transaction<T>(pool: Pool, role: ServiceRole, fn: (c:PoolClient)=>Promise<T>):Promise<T> {
 const c=await pool.connect();
 try {
  await c.query("BEGIN; SET LOCAL search_path=aios,pg_catalog; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='30s'");
  const r=(await c.query('SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  if(r.rolname!==role || r.rolsuper || r.rolbypassrls) throw new Error('service_authority_required');
  const value=await fn(c); await c.query('COMMIT');return value;
 } catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function scope(c:PoolClient,p:Principal,site:string|null,mode='write') {
 uuid(p.tenantId);uuid(p.userId);if(site)uuid(site);
 await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",[p.tenantId,p.userId]);
 await c.query('SELECT authorize($1,$2)',[mode,site]);
}
export async function tick(c:PoolClient, tenant:string) {
 await c.query('INSERT INTO knowledge_clock VALUES($1,0,clock_timestamp()) ON CONFLICT DO NOTHING',[tenant]);
 const r=(await c.query('UPDATE knowledge_clock SET seq=seq+1,recorded_at=greatest(clock_timestamp(),recorded_at) WHERE tenant_id=$1 RETURNING seq,recorded_at',[tenant])).rows[0];
 await c.query('INSERT INTO knowledge_commit VALUES($1,$2,$3)',[tenant,r.seq,r.recorded_at]);
 return {knowledge_seq:Number(r.seq),recorded_at:new Date(r.recorded_at).toISOString()};
}
export async function insertDomain(c:PoolClient,table:'crawl'|'self_audit_result',row:Record<string,unknown>) {
 validate(base+'domain.schema.json#/$defs/'+row.record_type,row);
 const entries=Object.entries(row).filter(([k])=>!['provenance_ids','evidence_ids','direct_output_ids','affected_output_ids'].includes(k));
 await c.query(`INSERT INTO ${table} (${entries.map(([k])=>k).join(',')}) VALUES(${entries.map((_,i)=>'$'+(i+1)).join(',')})`,entries.map(([,v])=>v));
}
export async function event(c:PoolClient,tenant:string,site:string,aggregate:string,run:string,type:string,payload:unknown,version=1) {
 const t=await tick(c,tenant);
 const v={event_id:randomUUID(),tenant_id:tenant,site_id:site,aggregate_id:aggregate,aggregate_version:t.knowledge_seq,
  schema_version:version,causation_id:null,correlation_id:run,occurred_at:t.recorded_at,...t,idempotency_key:randomUUID(),producer:'governed-work@0.0.1',event_type:type,payload};
 validate(base+'event.schema.json',v);
 await c.query('INSERT INTO outbox VALUES($1,$2,$3,$4,$5,$6,$7,NULL)',[tenant,site,v.event_id,aggregate,type,v,t.recorded_at]);
}
