---
id: "CAP-MEM-03"
title: "Graph projection integrity"
domain: "MEM"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "partial_behavior"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md"]
implementation: ["packages/understanding/index.ts", "packages/api/index.ts", "packages/persistence/migrations/003-readonly-publication.sql"]
tests: ["tests/understanding.test.ts", "tests/api.test.ts", "tests/jobs.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md"]
gaps: ["GAP-DOM-MEM"]
scope: "Bounded graph payload construction with supplied node/edge provenance plus scoped persisted publication readback."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-MEM-03 — Graph projection integrity

Canonical responsibility: [CAP-MEM-03](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `partial_behavior` / `TESTED`.

Bounded graph payload construction with supplied node/edge provenance plus scoped persisted publication readback.

Implementation: [index.ts](../../packages/understanding/index.ts), [index.ts](../../packages/api/index.ts), [003-readonly-publication.sql](../../packages/persistence/migrations/003-readonly-publication.sql)

Tests: [understanding.test.ts](../../tests/understanding.test.ts), [api.test.ts](../../tests/api.test.ts), [jobs.test.ts](../../tests/jobs.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No complete canonical Entity/Assertion graph authoring/replay pipeline or operational graph visualization; source graph is supplied in local tests.

Open gaps: [GAP-DOM-MEM](../gaps/GAP-DOM-MEM.md).

## Stage evidence

| Stage | Current evidence disposition |
| --- | --- |
| DEFINED | Canonical row and inherited contract linked above |
| IMPLEMENTED | Full canonical scope not established; partial code listed separately |
| TESTED | Full capability acceptance not established; fixture prerequisites are scope-limited |
| REAL_WORLD_VERIFIED | No authorized retained capability-level verification found |
| PRODUCTION_PROVEN | No production observation window/denominator and operations proof found |

## History

- 2026-09-18 baseline2b6d527: conservative inventory import; no maturity promotion from test counts or draft manifests.
