---
id: "CAP-SMP-01"
title: "Sitemap parsing"
domain: "SMP"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "partial_behavior"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md"]
implementation: ["packages/perception/sitemap.ts", "packages/jobs/frontier.ts", "packages/persistence/migrations/013-sitemap-documents.sql"]
tests: ["tests/sitemap.test.ts", "tests/sitemap-index-persistence.test.ts", "tests/frontier-persistence.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md"]
gaps: ["GAP-DOM-SMP", "GAP-004", "GAP-007"]
scope: "Bounded XML/text/index parsing, unsafe-XML denial and durable local index/leaf document provenance/admission."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-SMP-01 — Sitemap parsing

Canonical responsibility: [CAP-SMP-01](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `partial_behavior` / `TESTED`.

Bounded XML/text/index parsing, unsafe-XML denial and durable local index/leaf document provenance/admission.

Implementation: [sitemap.ts](../../packages/perception/sitemap.ts), [frontier.ts](../../packages/jobs/frontier.ts), [013-sitemap-documents.sql](../../packages/persistence/migrations/013-sitemap-documents.sql)

Tests: [sitemap.test.ts](../../tests/sitemap.test.ts), [sitemap-index-persistence.test.ts](../../tests/sitemap-index-persistence.test.ts), [frontier-persistence.test.ts](../../tests/frontier-persistence.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No full live sitemap discovery/recovery orchestration or independently released capability.

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
