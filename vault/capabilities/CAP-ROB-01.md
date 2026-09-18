---
id: "CAP-ROB-01"
title: "robots.txt evaluation"
domain: "ROB"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "partial_behavior"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md"]
implementation: ["packages/perception/robots.ts", "packages/perception/robots-admission.ts", "packages/jobs/frontier-context.ts", "packages/jobs/http-bootstrap-projection.ts", "packages/jobs/isolated-http-fixture-supervisor.ts"]
tests: ["tests/robots.test.ts", "tests/frontier-persistence.test.ts", "tests/jobs.test.ts", "tests/http-bootstrap-projection.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md", "reports/GOVERNED-ROBOTS-COMPLETION.md"]
gaps: ["GAP-DOM-ROB", "GAP-004", "GAP-007", "GAP-044"]
scope: "Bounded RFC-style agent/group/path matching, status handling and robots-first synthetic collection/admission."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---


# CAP-ROB-01 — robots.txt evaluation

Canonical responsibility: [CAP-ROB-01](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `partial_behavior` / `TESTED`.

Bounded RFC-style agent/group/path matching, status handling and robots-first synthetic collection/admission.

Implementation: [robots.ts](../../packages/perception/robots.ts), [robots-admission.ts](../../packages/perception/robots-admission.ts), [frontier-context.ts](../../packages/jobs/frontier-context.ts)

Tests: [robots.test.ts](../../tests/robots.test.ts), [frontier-persistence.test.ts](../../tests/frontier-persistence.test.ts), [jobs.test.ts](../../tests/jobs.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No independently released full capability or deployed live crawler/platform-agent coverage verification.

Open gaps: [GAP-DOM-ROB](../gaps/GAP-DOM-ROB.md), [GAP-004](../gaps/GAP-004.md), [GAP-007](../gaps/GAP-007.md).

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

- 2026-09-19 afterf5402a1: [governed robots completion](../../reports/GOVERNED-ROBOTS-COMPLETION.md) progresses GAP-044; verification pending, full capability maturity unchanged.

- 2026-09-19: GAP-044 closed locally against [report](../../reports/GOVERNED-ROBOTS-COMPLETION.md):584 source/89 compiled/1 actual Docker integration. Parent and full capability scope remain incomplete.
