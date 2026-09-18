---
id: "CAP-CRW-03"
title: "Trap and duplicate-work control"
domain: "CRW"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "partial_behavior"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md"]
implementation: ["packages/perception/index.ts", "packages/jobs/frontier.ts", "packages/jobs/frontier-links.ts"]
tests: ["tests/perception.test.ts", "tests/frontier-persistence.test.ts", "tests/frontier-links.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md"]
gaps: ["GAP-DOM-CRW", "GAP-004", "GAP-007"]
scope: "Full normalized URL deduplication, depth/URL/query-variant caps and conservative retained frontier lineage."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-CRW-03 — Trap and duplicate-work control

Canonical responsibility: [CAP-CRW-03](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `partial_behavior` / `TESTED`.

Full normalized URL deduplication, depth/URL/query-variant caps and conservative retained frontier lineage.

Implementation: [index.ts](../../packages/perception/index.ts), [frontier.ts](../../packages/jobs/frontier.ts), [frontier-links.ts](../../packages/jobs/frontier-links.ts)

Tests: [perception.test.ts](../../tests/perception.test.ts), [frontier-persistence.test.ts](../../tests/frontier-persistence.test.ts), [frontier-links.test.ts](../../tests/frontier-links.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No response-fingerprint trap diagnosis, qualified trap candidate records or false-positive review of valid product/facet families.

Open gaps: [GAP-DOM-CRW](../gaps/GAP-DOM-CRW.md), [GAP-004](../gaps/GAP-004.md), [GAP-007](../gaps/GAP-007.md).

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
