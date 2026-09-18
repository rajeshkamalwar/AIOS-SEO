---
id: "CAP-MEM-04"
title: "Retention and correction propagation"
domain: "MEM"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "partial_behavior"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md"]
implementation: ["packages/policy/deletion.ts", "packages/policy/input-eligibility.ts", "packages/runtime/index.ts", "packages/evidence/index.ts"]
tests: ["tests/jobs.test.ts", "tests/input-eligibility.test.ts", "tests/runtime.test.ts", "tests/blob.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md"]
gaps: ["GAP-DOM-MEM"]
scope: "Independent local deletion tombstone fences, audit rejection propagation and local orphan cleanup/readiness checks."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-MEM-04 — Retention and correction propagation

Canonical responsibility: [CAP-MEM-04](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `partial_behavior` / `TESTED`.

Independent local deletion tombstone fences, audit rejection propagation and local orphan cleanup/readiness checks.

Implementation: [deletion.ts](../../packages/policy/deletion.ts), [input-eligibility.ts](../../packages/policy/input-eligibility.ts), [index.ts](../../packages/runtime/index.ts), [index.ts](../../packages/evidence/index.ts)

Tests: [jobs.test.ts](../../tests/jobs.test.ts), [input-eligibility.test.ts](../../tests/input-eligibility.test.ts), [runtime.test.ts](../../tests/runtime.test.ts), [blob.test.ts](../../tests/blob.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No complete active-store/provider/backup purge workflow or deployed restore/correction propagation; boolean recovery inputs do not prove a production restore.

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
