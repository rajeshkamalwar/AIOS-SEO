---
id: "CAP-MEM-01"
title: "As-known-then retrieval"
domain: "MEM"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "partial_behavior"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md"]
implementation: ["packages/persistence/index.ts", "packages/persistence/transaction.ts", "packages/persistence/migrations/001-evidence-ledger.sql"]
tests: ["tests/foundation.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md"]
gaps: ["GAP-DOM-MEM"]
scope: "Tenant sequence/known-time cutoffs, immutable evidence/observations and frozen bundle membership verified across concurrency/restart."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-MEM-01 — As-known-then retrieval

Canonical responsibility: [CAP-MEM-01](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `partial_behavior` / `TESTED`.

Tenant sequence/known-time cutoffs, immutable evidence/observations and frozen bundle membership verified across concurrency/restart.

Implementation: [index.ts](../../packages/persistence/index.ts), [transaction.ts](../../packages/persistence/transaction.ts), [001-evidence-ledger.sql](../../packages/persistence/migrations/001-evidence-ledger.sql)

Tests: [foundation.test.ts](../../tests/foundation.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: Full valid-time assertion/revision retrieval and historical reconstruction across all Brain domain types remain incomplete.

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
