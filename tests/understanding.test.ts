import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { literalClaims, gatewayDisabled, graphProjection, selectOpportunities } from "../packages/understanding/index.js";
const id=randomUUID();
test("understanding extracts only literal evidence-backed claims",()=>{const claims=literalClaims("<title>Orange Plumbing</title><p>Services: pipe repair. Serving Nagpur.</p>",id);assert.equal(claims.length,3);assert.ok(claims.every(x=>x.basis==="observed"&&x.evidence_ids[0]===id));});
test("provider-neutral gateway fails closed in local profile",()=>assert.deepEqual(gatewayDisabled(),{status:"unavailable",provider:"local-synthetic-v1",reason:"external_model_policy_disabled"}));
test("graph projection has bounded real endpoints and schema-valid support",()=>{const s={source_applicability:"applicable" as const,integrity:"verified" as const,coverage:"complete_in_scope" as const,identity:"provisional" as const,inference:"deterministic" as const,reasons:["fixture"]};const a=randomUUID(),b=randomUUID();const g=graphProjection(randomUUID(),3,new Date().toISOString(),[{id:a,type:"page",label:"Home",basis:"observed",evidence_ids:[id],support:s},{id:b,type:"page",label:"Services",basis:"observed",evidence_ids:[id],support:s}],[{id:randomUUID(),subject_id:a,predicate:"page_links_to",object_id:b,assertion_id:randomUUID(),basis:"observed",evidence_ids:[id],support:s,valid_from:null,valid_to:null,recorded_at:new Date().toISOString()}]);assert.equal(g.edges.length,1);});
test("opportunities are deterministic, deduplicated and capped at three",()=>{const b=randomUUID();const make=(priority:1|2|3,capability:string):any=>({id:randomUUID(),priority,reason:"evidence",target_ids:[id],evidence_bundle_id:b,capability_id:capability,objective:"protect"});const x=selectOpportunities([make(3,"a"),make(1,"b"),make(2,"c"),make(1,"a"),make(3,"d")]);assert.equal(x.length,3);assert.deepEqual(x.map(v=>v.priority),[1,1,2]);});

const graphSupport = {source_applicability:"applicable" as const,integrity:"verified" as const,coverage:"complete_in_scope" as const,identity:"provisional" as const,inference:"deterministic" as const,reasons:["fixture"]};
const graphTime = "2026-09-18T00:00:00.000Z";
function graphNode() { return {id:randomUUID(),type:"page",label:"Fixture page",basis:"observed" as const,evidence_ids:[id],support:graphSupport}; }
function graphEdge(subjectId:string,objectId:string) { return {id:randomUUID(),subject_id:subjectId,predicate:"page_links_to",object_id:objectId,assertion_id:randomUUID(),basis:"observed" as const,evidence_ids:[id],support:graphSupport,valid_from:null,valid_to:null,recorded_at:graphTime}; }

test("graph node truncation never exposes edges to omitted endpoints",()=>{
  const nodes=Array.from({length:201},graphNode);
  const visible=graphEdge(nodes[0]!.id,nodes[199]!.id);
  const edges=[graphEdge(nodes[0]!.id,nodes[200]!.id),visible,graphEdge(nodes[200]!.id,nodes[0]!.id)];
  const graph=graphProjection(randomUUID(),3,graphTime,nodes,edges);
  assert.deepEqual(graph.nodes,nodes.slice(0,200));
  assert.deepEqual(graph.edges,[visible]);
  assert.equal(graph.truncated,true);
  assert.equal(graph.next_cursor,null);
});

test("graph omits missing endpoints and reports actual omissions",()=>{
  const nodes=[graphNode(),graphNode()];
  const visible=graphEdge(nodes[0]!.id,nodes[1]!.id);
  const graph=graphProjection(randomUUID(),3,graphTime,nodes,[graphEdge(randomUUID(),nodes[0]!.id),visible,graphEdge(nodes[0]!.id,randomUUID())]);
  assert.deepEqual(graph.edges,[visible]);
  assert.equal(graph.truncated,true);
  const complete=graphProjection(randomUUID(),3,graphTime,nodes,[visible]);
  assert.equal(complete.truncated,false);
});

test("graph retains the edge cap after endpoint filtering without inventing totals or cursors",()=>{
  const nodes=Array.from({length:200},graphNode);
  const edges=Array.from({length:401},(_,i)=>graphEdge(nodes[Math.floor(i/200)]!.id,nodes[i%200]!.id));
  const graph=graphProjection(randomUUID(),3,graphTime,nodes,[graphEdge(randomUUID(),nodes[0]!.id),...edges]);
  assert.deepEqual(graph.edges,edges.slice(0,400));
  assert.equal(graph.nodes.length,200);
  assert.equal(graph.truncated,true);
  assert.equal(graph.next_cursor,null);
  const exact=graphProjection(randomUUID(),3,graphTime,nodes,edges.slice(0,400));
  assert.equal(exact.truncated,false);
});
