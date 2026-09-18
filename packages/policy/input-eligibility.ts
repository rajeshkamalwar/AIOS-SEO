import type { PoolClient } from 'pg';
import { uuid } from '../contracts/index.js';
import { rules, ruleVersion } from './index.js';
import { workLock } from '../persistence/transaction.js';

/** Current governance fence, independent of an evidence bundle's historical cutoff.
 * Reads independently owned records only; never evaluates, writes recovery, or
 * clears work_fence. Absence of a restriction is not publication-gate approval.
 * Call inside the consumer transaction before I/O and again before commit.
 */
export async function assertInputsEligible(c:PoolClient,tenant:string,site:string,run:string,ids:readonly string[]):Promise<void>{
 for(const id of [tenant,site,run,...ids])uuid(id);
 // Migration 014 makes every receipt/impact/recovery writer and clock writer
 // take this boundary too. The lock survives until consumer commit/rollback.
 await c.query('SELECT pg_advisory_xact_lock($1)',[workLock]);
 const unique=[...new Set(ids)];
 const fence=(await c.query('SELECT quarantined FROM work_fence WHERE tenant_id=$1 AND site_id=$2 AND crawl_id=$3',[tenant,site,run])).rows[0];
 if(!fence)throw new Error('scope_denied');
 if(fence.quarantined)throw new Error('audit_run_quarantined');
 if(Number((await c.query('SELECT count(*) FROM record_index WHERE tenant_id=$1 AND site_id=$2 AND id=ANY($3::uuid[])',[tenant,site,unique])).rows[0].count)!==unique.length)throw new Error('scope_denied');
 // Site-qualified impacts include restrictions issued in another run against
 // the exact same retained source. A new run cannot launder rejected evidence.
 const rows=(await c.query(`SELECT a.*,clock_timestamp() AS checked_at,
   recovery.passing_receipt_id,recovery.reviewed_at
   FROM self_audit_result a LEFT JOIN audit_recovery recovery ON recovery.tenant_id=a.tenant_id AND recovery.receipt_id=a.id
   WHERE a.tenant_id=$1 AND a.site_id=$2 LIMIT 5001`,[tenant,site])).rows;
 // Explicit local adapter safety bound, never interpret a truncated graph as
 // permission. Also bounds recursive recovery depth; no silent partial loads.
 if(rows.length>5000)throw new Error('audit_graph_budget_exceeded');
 const impacts=(await c.query('SELECT receipt_id,output_id FROM audit_impact WHERE tenant_id=$1 AND site_id=$2 LIMIT 10001',[tenant,site])).rows;
 if(impacts.length>10000)throw new Error('audit_graph_budget_exceeded');
 const impactMap=new Map<string,string[]>();
 for(const impact of impacts){const list=impactMap.get(impact.receipt_id)??[];list.push(impact.output_id);impactMap.set(impact.receipt_id,list);}
 for(const row of rows)row.affected=impactMap.get(row.id)??[];
 const sourceRuns=new Set((await c.query('SELECT DISTINCT crawl_id FROM audit_output WHERE tenant_id=$1 AND site_id=$2 AND output_id=ANY($3::uuid[]) LIMIT 5001',[tenant,site,unique])).rows.map(row=>row.crawl_id));
 if(sourceRuns.size>5000)throw new Error('audit_graph_budget_exceeded');
 const byId=new Map(rows.map(row=>[row.id,row]));
 const restricted=rows.filter(row=>row.effect==='reject_outputs'||row.effect==='quarantine_run'||row.scope_complete!==true);
 const cleared=new Map<string,boolean>();
 function recovered(row:typeof rows[number],visiting=new Set<string>()):boolean{
  if(visiting.size>=128)throw new Error('audit_graph_budget_exceeded');
  if(cleared.has(row.id))return cleared.get(row.id)!;
  if(visiting.has(row.id))return false;
  const pass=byId.get(row.passing_receipt_id);
  const later=pass&&Number(pass.knowledge_seq)>Number(row.knowledge_seq)&&+new Date(pass.recorded_at)>=+new Date(row.recorded_at);
  const reviewed=pass&&row.reviewed_at&&+new Date(row.reviewed_at)>=+new Date(pass.recorded_at)&&+new Date(row.reviewed_at)<=+new Date(row.checked_at);
  if(!pass||pass.id===row.id||pass.recovery_of_id!==row.id||pass.crawl_id!==row.crawl_id||pass.check_id!==row.check_id||pass.check_version!==row.check_version||
    pass.check_version!==ruleVersion||!rules.some(rule=>rule.id===pass.check_id)||Number(pass.schema_version)!==2||pass.state!=='recorded'||pass.result!=='pass'||pass.effect!=='allow'||pass.scope_complete!==true||!later||!reviewed){cleared.set(row.id,false);return false;}
  const next=new Set(visiting).add(row.id);
  // A rejected witness cannot clear another restriction. Generic run quarantine
  // does not prohibit independent recovery evaluation: otherwise two valid
  // reviewed recoveries would circularly prevent each other from clearing.
  if(restricted.some(other=>other.id!==row.id&&
    other.affected.includes(pass.id)&&
    !recovered(other,next))){cleared.set(row.id,false);return false;}
  cleared.set(row.id,true);return true;
 }
 const inputSet=new Set(unique);
 for(const row of restricted){
  if(recovered(row))continue;
  if((row.crawl_id===run||sourceRuns.has(row.crawl_id))&&(row.effect==='quarantine_run'||row.scope_complete!==true||row.scope!=='outputs'||row.affected.length===0))throw new Error('audit_run_quarantined');
  if(row.affected.some((id:string)=>inputSet.has(id)))throw new Error('audit_input_rejected');
 }
}
