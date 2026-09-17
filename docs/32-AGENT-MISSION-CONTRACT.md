# 32 — Agent Mission Contract

Status: binding mission envelope in [agent-mission.schema.json](../spec/agent-mission.schema.json).

Strategy creates objective/capability selection; scheduler allocates bounded work. A mission pins tenant, site, crawl, bundle, allowed skill digests/tool versions, internal authority, output schema, budget, deadline, stop/failure conditions and evaluation gates. External authority is always read_only. Derived records are proposals accepted by domain validation, not arbitrary database writes.

Allowed tool IDs resolve installed typed adapters. assessment.record accepts only TwinAssertion, EntityAssertion, Belief, Hypothesis or Opportunity candidates. It cannot create Membership, SkillRelease, Approval, Strategy authority, Evidence or SelfAuditResult. Server assigns IDs/timestamps/sequences to accepted records and checks basis/policy; caller cannot backdate acceptance or mark its own output independently verified. Collection service alone accepts evidence; independent evaluator alone writes audit receipts; Strategy alone accepts portfolio revisions.

Admission checks mission scope, approved release dependency DAG, source freshness, declared output, budget ≤run remainder and deadline≤run deadline. Every dispatch repeats dynamic grants/revocation/deletion/cancellation checks. Checks and spend reservation are atomic under scoped locks; remote work executes outside locks. A lease token fences final acceptance. Recovered work keeps original immutable mission manifest; fresh data/replacement skill requires a new mission.

No child missions or recursion in v1. Stop at cancellation, deadline, exhausted budget, revoked skill or unavailable policy. Invalid schema/scope is terminal; insufficient evidence produces abstained with missing inputs, not an invented finding. Source transport errors follow33 bounded retries. Completion requires independently validated persisted output references; an agent saying done is not a completion receipt.

Trace: mission ID→bundle→skill/release generation→tool invocation/reservation→attempt→output→evaluation. Rationales are concise decision explanations; no hidden chain-of-thought requirement. Prompt injection cannot change the manifest, select another tenant, call shell or grant tools. Failed attempts remain auditable without logging raw sensitive content.
