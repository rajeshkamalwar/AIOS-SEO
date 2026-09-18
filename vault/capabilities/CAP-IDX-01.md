---
id: "CAP-IDX-01"
title: "Technical eligibility"
domain: "IDX"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "foundation_only"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md", "spec/examples/skill-directive-baseline.json"]
implementation: ["packages/perception/robots.ts", "packages/perception/dom.ts", "packages/perception/collector.ts"]
tests: ["tests/robots.test.ts", "tests/dom.test.ts", "tests/collector.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md"]
gaps: ["GAP-DOM-IDX"]
scope: "Collection of status/robots/named-meta facts needed by later technical eligibility evaluation."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-IDX-01 — Technical eligibility

Canonical responsibility: [CAP-IDX-01](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `foundation_only` / `TESTED`.

Collection of status/robots/named-meta facts needed by later technical eligibility evaluation.

Implementation: [robots.ts](../../packages/perception/robots.ts), [dom.ts](../../packages/perception/dom.ts), [collector.ts](../../packages/perception/collector.ts)

Tests: [robots.test.ts](../../tests/robots.test.ts), [dom.test.ts](../../tests/dom.test.ts), [collector.test.ts](../../tests/collector.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No combined technical-indexability evaluator, index-state evidence or released directive skill.

Open gaps: [GAP-DOM-IDX](../gaps/GAP-DOM-IDX.md).

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
