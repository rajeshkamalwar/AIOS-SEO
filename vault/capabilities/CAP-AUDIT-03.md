---
id: "CAP-AUDIT-03"
title: "Work and cost control"
domain: "AUDIT"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "partial_behavior"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md"]
implementation: ["packages/jobs/index.ts", "packages/jobs/http-lane.ts"]
tests: ["tests/jobs.test.ts", "tests/http-lane.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md"]
gaps: ["GAP-DOM-AUDIT", "GAP-015"]
scope: "Durable job attempts/leases/deadlines, cancellation/retry limits and conservative global HTTP slot/request/byte accounting including crash recovery tests."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-AUDIT-03 — Work and cost control

Canonical responsibility: [CAP-AUDIT-03](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `partial_behavior` / `TESTED`.

Durable job attempts/leases/deadlines, cancellation/retry limits and conservative global HTTP slot/request/byte accounting including crash recovery tests.

Implementation: [index.ts](../../packages/jobs/index.ts), [http-lane.ts](../../packages/jobs/http-lane.ts)

Tests: [jobs.test.ts](../../tests/jobs.test.ts), [http-lane.test.ts](../../tests/http-lane.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No full live lane dispatch/worker-stop reconciliation or deployed runaway-monitoring system; unknown slots remain fail-closed.

Open gaps: [GAP-DOM-AUDIT](../gaps/GAP-DOM-AUDIT.md), [GAP-015](../gaps/GAP-015.md).

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
