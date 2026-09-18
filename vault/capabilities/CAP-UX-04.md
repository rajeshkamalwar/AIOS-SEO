---
id: "CAP-UX-04"
title: "Real Brain exploration"
domain: "UX"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "foundation_only"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md"]
implementation: ["packages/api/index.ts", "packages/understanding/index.ts"]
tests: ["tests/api.test.ts", "tests/understanding.test.ts"]
reports: ["reports/API-CONTRACT-CORRECTIONS.md", "docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md", "reports/POST-VAULT-READONLY-CORRECTIONS.md"]
gaps: ["GAP-DOM-UX", "GAP-019", "GAP-026", "GAP-016"]
scope: "Authorized bounded graph payload/readback and watermark fields."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-UX-04 — Real Brain exploration

Canonical responsibility: [CAP-UX-04](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `foundation_only` / `TESTED`.

Authorized bounded graph payload/readback and watermark fields.

Implementation: [index.ts](../../packages/api/index.ts), [index.ts](../../packages/understanding/index.ts)

Tests: [api.test.ts](../../tests/api.test.ts), [understanding.test.ts](../../tests/understanding.test.ts)

Evidence/reports: ["reports/API-CONTRACT-CORRECTIONS.md", 40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No interactive real Brain graph client or provenance drill-down experience.

Open gaps: [GAP-DOM-UX](../gaps/GAP-DOM-UX.md), [GAP-019](../gaps/GAP-019.md).

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

- 2026-09-18: local read-only correction checkpoint tracks [GAP-026](../gaps/GAP-026.md), [GAP-016](../gaps/GAP-016.md). Full capability remains DEFINED / INCOMPLETE.

Scoped verification: [post-vault correction report](../../reports/POST-VAULT-READONLY-CORRECTIONS.md). Capability maturity and completion are unchanged.

- 2026-09-18 API boundary checkpoint: [verification](../../reports/API-CONTRACT-CORRECTIONS.md); maturity unchanged. Publication authority/current eligibility is tracked in [GAP-030](../gaps/GAP-030.md).
