---
id: "CAP-CRW-01"
title: "Scoped discovery"
domain: "CRW"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "partial_behavior"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md", "spec/examples/skill-public-discovery.json"]
implementation: ["packages/perception/url.ts", "packages/perception/robots-admission.ts", "packages/jobs/frontier.ts", "packages/jobs/frontier-links.ts", "packages/jobs/frontier-context.ts", "packages/persistence/index.ts", "packages/jobs/isolated-http-fixture-supervisor.ts", "packages/jobs/docker-http-fixture.ts", "packages/perception/http-fixture-broker.ts"]
tests: ["tests/site-scope.test.ts", "tests/frontier-persistence.test.ts", "tests/frontier-links.test.ts", "tests/sitemap-index-persistence.test.ts", "tests/jobs.test.ts", "tests/http-isolated.test.ts", "tests/http-fixture-broker.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md", "reports/ISOLATED-HTTP-EGRESS.md"]
gaps: ["GAP-DOM-CRW", "GAP-004", "GAP-007", "GAP-041"]
scope: "Synthetic scope receipts, robots-pinned durable sitemap/index/link frontier admission and loopback HTTP-to-PageSnapshot composition."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-CRW-01 — Scoped discovery

Canonical responsibility: [CAP-CRW-01](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `partial_behavior` / `TESTED`.

Synthetic scope receipts, robots-pinned durable sitemap/index/link frontier admission and loopback HTTP-to-PageSnapshot composition.

Implementation: [url.ts](../../packages/perception/url.ts), [robots-admission.ts](../../packages/perception/robots-admission.ts), [frontier.ts](../../packages/jobs/frontier.ts), [frontier-links.ts](../../packages/jobs/frontier-links.ts), [frontier-context.ts](../../packages/jobs/frontier-context.ts), [index.ts](../../packages/persistence/index.ts)

Tests: [site-scope.test.ts](../../tests/site-scope.test.ts), [frontier-persistence.test.ts](../../tests/frontier-persistence.test.ts), [frontier-links.test.ts](../../tests/frontier-links.test.ts), [sitemap-index-persistence.test.ts](../../tests/sitemap-index-persistence.test.ts), [jobs.test.ts](../../tests/jobs.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No complete governed public-site dispatcher, deployed egress, recurring crawl runner or released capability.

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

- 2026-09-18 after6131ee2: isolated local HTTP prerequisite under implementation; [GAP-041](../gaps/GAP-041.md) and its report track verification. Full capability maturity unchanged.

- 2026-09-18: [isolated HTTP report](../../reports/ISOLATED-HTTP-EGRESS.md) verifies GAP-041 local prerequisite (509 source/97 compiled/2 actual Docker cases). No full-capability maturity promotion.
