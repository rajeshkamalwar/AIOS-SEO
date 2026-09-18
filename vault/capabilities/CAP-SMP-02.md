---
id: "CAP-SMP-02"
title: "Membership consistency"
domain: "SMP"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "foundation_only"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md", "spec/examples/skill-sitemap-reconciliation.json"]
implementation: ["packages/jobs/frontier.ts", "packages/jobs/frontier-links.ts"]
tests: ["tests/frontier-persistence.test.ts", "tests/sitemap-index-persistence.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md"]
gaps: ["GAP-DOM-SMP", "GAP-004", "GAP-007"]
scope: "Retained sitemap membership and source associations can supply later reconciliation inputs."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-SMP-02 — Membership consistency

Canonical responsibility: [CAP-SMP-02](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `foundation_only` / `TESTED`.

Retained sitemap membership and source associations can supply later reconciliation inputs.

Implementation: [frontier.ts](../../packages/jobs/frontier.ts), [frontier-links.ts](../../packages/jobs/frontier-links.ts)

Tests: [frontier-persistence.test.ts](../../tests/frontier-persistence.test.ts), [sitemap-index-persistence.test.ts](../../tests/sitemap-index-persistence.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No response/canonical/indexability discrepancy evaluator; sitemap-reconciliation manifest is draft only.

Open gaps: [GAP-DOM-SMP](../gaps/GAP-DOM-SMP.md), [GAP-004](../gaps/GAP-004.md), [GAP-007](../gaps/GAP-007.md).

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
