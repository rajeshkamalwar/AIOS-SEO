---
id: "CAP-TER-04"
title: "Opportunity prioritization"
domain: "TER"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "partial_behavior"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md", "spec/examples/skill-initial-opportunities.json"]
implementation: ["packages/understanding/index.ts"]
tests: ["tests/understanding.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md", "reports/M4-IMPLEMENTATION.md", "reports/M5-IMPLEMENTATION.md"]
gaps: ["GAP-DOM-TER", "GAP-017"]
scope: "Deterministic sorting/deduplication/capping of caller-supplied opportunities to three."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-TER-04 — Opportunity prioritization

Canonical responsibility: [CAP-TER-04](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `partial_behavior` / `TESTED`.

Deterministic sorting/deduplication/capping of caller-supplied opportunities to three.

Implementation: [index.ts](../../packages/understanding/index.ts)

Tests: [understanding.test.ts](../../tests/understanding.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No generated/evaluated constrained opportunity portfolio, business relevance, benefit/cost or overlap model.

Open gaps: [GAP-DOM-TER](../gaps/GAP-DOM-TER.md), [GAP-017](../gaps/GAP-017.md).

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

Direct implementation milestones: [M4 report](../../reports/M4-IMPLEMENTATION.md), [M5 report](../../reports/M5-IMPLEMENTATION.md).
