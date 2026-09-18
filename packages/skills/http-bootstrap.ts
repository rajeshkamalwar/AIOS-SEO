import type {PoolClient} from 'pg';
/** Only the fixed local robots bootstrap handler is installed; public discovery remains a draft. */
export function assertHttpBootstrapManifest(m:Record<string,any>):void {
 const step=m.procedure?.[0];
 if(m.output_schema!=='https://schemas.aios-seo.invalid/v1/http-bootstrap-execution.schema.json'||m.external_authority!=='read_only'||m.procedure?.length!==1||step.operation!=='http_bootstrap_fixture_v1'||step.executor!=='deterministic'||step.tool_id!=='http.fetch_public'||JSON.stringify(step.input_kinds)!=='["site_scope"]'||step.output_kind!=='http_bootstrap_receipt'||step.on_failure!=='abstain'||m.tool_permissions?.length!==1||!m.tool_permissions.some((p:any)=>p.tool_id==='http.fetch_public'&&p.version==='1.0.0'&&p.max_calls===1)||!m.policy_constraints?.includes('local-synthetic-v1')||!m.policy_constraints?.includes('discovery-v1'))throw new Error('handler_not_installed');
}
export async function assertHttpBootstrapRelease(c:PoolClient,digest:string):Promise<void>{
 const row=(await c.query('SELECT manifest FROM control.release WHERE digest=$1',[digest])).rows[0];
 if(!row)throw new Error('skill_unapproved');assertHttpBootstrapManifest(row.manifest);
}
