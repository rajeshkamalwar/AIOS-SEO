import type {PoolClient} from 'pg';
/** Only this fixed local replay handler is installed; parity remains a draft. */
export function assertOfflineRenderManifest(m:Record<string,any>):void {
 const step=m.procedure?.[0];
 if(m.output_schema!=='https://schemas.aios-seo.invalid/v1/offline-render-execution.schema.json'||m.external_authority!=='read_only'||m.procedure?.length!==1||step.operation!=='offline_render_v1'||step.executor!=='deterministic'||step.tool_id!=='render.observe'||JSON.stringify(step.input_kinds)!=='["raw_html"]'||step.output_kind!=='offline_render_receipt'||step.on_failure!=='abstain'||m.tool_permissions?.length!==1||!m.tool_permissions.some((p:any)=>p.tool_id==='render.observe'&&p.version==='1.0.0'&&p.max_calls===1)||!m.policy_constraints?.includes('local-synthetic-v1')||!m.policy_constraints?.includes('discovery-v1'))throw new Error('handler_not_installed');
}
export async function assertOfflineRenderRelease(c:PoolClient,digest:string):Promise<void>{
 const row=(await c.query('SELECT manifest FROM control.release WHERE digest=$1',[digest])).rows[0];
 if(!row)throw new Error('skill_unapproved');assertOfflineRenderManifest(row.manifest);
}
