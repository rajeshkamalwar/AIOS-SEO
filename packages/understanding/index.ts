import { randomUUID } from "node:crypto";
import { base, validate, manifestHash } from "../contracts/index.js";

export type Support = { source_applicability: "applicable"|"uncertain"|"inapplicable"; integrity: "verified"|"unverified"|"failed"; coverage: "complete_in_scope"|"partial"|"unknown"; identity: "resolved"|"provisional"|"disputed"; inference: "deterministic"|"supported"|"provisional"|"contradicted"|"unknown"; reasons: string[] };
const observed: Support = { source_applicability:"applicable", integrity:"verified", coverage:"complete_in_scope", identity:"provisional", inference:"deterministic", reasons:["literal_public_page_text"] };
export type Claim = { field: string; value: string; basis: "observed"|"inferred"; evidence_ids: string[]; locator: string; support: Support };
export function literalClaims(text: string, evidenceId: string): Claim[] {
  const out: Claim[] = [];
  const patterns: [string,RegExp][] = [["business_name",/<title[^>]*>\s*([^<]{2,120})\s*<\/title>/i],["offering",/(?:we offer|services?:)\s*([^.<]{2,120})/i],["location",/(?:serving|located in|based in)\s*([A-Z][A-Za-z .'-]{2,80})/i]];
  for (const [field,re] of patterns) { const m=text.match(re); if (m?.[1]) out.push({field,value:m[1].trim(),basis:"observed",evidence_ids:[evidenceId],locator:"text:literal",support:observed}); }
  const result={claims:out,unknown_fields:["archetype","audience","conversion_goal"],questions:[],outcome:out.length?"completed":"abstained"} as const;
  validate(base+"inference-output.schema.json",result); return out;
}
export function gatewayDisabled(): { status:"unavailable"; provider:"local-synthetic-v1"; reason:string } { return {status:"unavailable",provider:"local-synthetic-v1",reason:"external_model_policy_disabled"}; }

export type GraphNode={id:string;type:string;label:string;basis:"observed"|"inferred"|"confirmed";evidence_ids:string[];support:Support};
export type GraphEdge={id:string;subject_id:string;predicate:string;object_id:string;assertion_id:string;basis:"observed"|"inferred"|"confirmed";evidence_ids:string[];support:Support;valid_from:string|null;valid_to:string|null;recorded_at:string};
export function graphProjection(siteId:string, knownSeq:number, knownAt:string, nodes:GraphNode[], edges:GraphEdge[]) {
  const visibleNodes=nodes.slice(0,200);
  const ids=new Set(visibleNodes.map(n=>n.id));
  const visibleEdges=edges.filter(e=>ids.has(e.subject_id)&&ids.has(e.object_id)).slice(0,400);
  const graph={site_id:siteId,watermark:knownSeq,known_at:knownAt,valid_at:knownAt,view:"client",nodes:visibleNodes,edges:visibleEdges,truncated:nodes.length>visibleNodes.length||edges.length>visibleEdges.length,next_cursor:null};
  validate(base+"graph.schema.json",graph); return graph;
}
export type Opportunity={id:string; priority:1|2|3; reason:string; target_ids:string[]; evidence_bundle_id:string; capability_id:string; objective:"understand"|"grow"|"protect"};
export function selectOpportunities(items: Opportunity[]): Opportunity[] {
  return [...items].sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id)).filter((v,i,a)=>a.findIndex(x=>x.capability_id===v.capability_id&&x.target_ids.join(",")===v.target_ids.join(","))===i).slice(0,3);
}
export const decisionHash=(value:unknown)=>manifestHash(value);
