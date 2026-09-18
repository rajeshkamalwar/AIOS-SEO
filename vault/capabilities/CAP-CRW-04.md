---
id: "CAP-CRW-04"
title: "Coverage reconciliation"
domain: "CRW"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "foundation_only"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md"]
implementation: ["packages/perception/index.ts", "packages/jobs/frontier.ts", "packages/api/index.ts"]
tests: ["tests/frontier-persistence.test.ts", "tests/api.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md"]
gaps: ["GAP-DOM-CRW", "GAP-004", "GAP-007"]
scope: "Frontier counters and explicit admission outcomes; API coverage contract exists and default projection remains unknown."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-CRW-04 — Coverage reconciliation

Canonical responsibility: [CAP-CRW-04](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `foundation_only` / `TESTED`.

Frontier counters and explicit admission outcomes; API coverage contract exists and default projection remains unknown.

Implementation: [index.ts](../../packages/perception/index.ts), [frontier.ts](../../packages/jobs/frontier.ts), [index.ts](../../packages/api/index.ts)

Tests: [frontier-persistence.test.ts](../../tests/frontier-persistence.test.ts), [api.test.ts](../../tests/api.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No complete discovered/admitted/visited/failed/excluded reconciliation across a live crawl; API run counters are placeholders, not real site coverage.

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
