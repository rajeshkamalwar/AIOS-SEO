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
implementation: ["packages/perception/url.ts", "packages/perception/robots-admission.ts", "packages/jobs/frontier.ts", "packages/jobs/frontier-links.ts", "packages/jobs/frontier-context.ts", "packages/persistence/index.ts", "packages/jobs/isolated-http-fixture-supervisor.ts", "packages/jobs/docker-http-fixture.ts", "packages/perception/http-fixture-broker.ts", "packages/perception/reviewed-fixtures.ts", "packages/jobs/http-bootstrap-job.ts", "packages/jobs/index.ts", "packages/jobs/http-lane.ts", "packages/skills/http-bootstrap.ts", "packages/persistence/migrations/021-http-bootstrap-job.sql", "packages/jobs/http-bootstrap-acceptance.ts", "packages/persistence/migrations/022-http-bootstrap-acceptance.sql", "packages/jobs/http-bootstrap-projection.ts", "packages/jobs/http-bootstrap-seed.ts", "packages/persistence/migrations/024-http-bootstrap-seed.sql", "packages/jobs/isolated-http-seed-fixture-supervisor.ts", "packages/perception/http-seed-fixture-broker.ts", "packages/perception/http-fixture-broker-core.ts", "packages/skills/http-seed.ts", "packages/jobs/http-seed-job.ts", "packages/persistence/migrations/025-http-seed-job.sql"]
tests: ["tests/site-scope.test.ts", "tests/frontier-persistence.test.ts", "tests/frontier-links.test.ts", "tests/sitemap-index-persistence.test.ts", "tests/jobs.test.ts", "tests/http-isolated.test.ts", "tests/http-fixture-broker.test.ts", "tests/reviewed-fixtures.test.ts", "tests/http-evidence.test.ts", "tests/offline-render-source.test.ts", "tests/http-bootstrap.test.ts", "tests/http-fixture-engine.test.ts", "tests/http-acceptance.test.ts", "tests/http-bootstrap-projection.test.ts", "tests/http-bootstrap-seed.test.ts", "tests/http-seed.test.ts", "tests/http-seed-fixture-broker.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md", "reports/ISOLATED-HTTP-EGRESS.md", "reports/REVIEWED-FIXTURE-RETENTION.md", "reports/GOVERNED-HTTP-BOOTSTRAP.md", "reports/GOVERNED-HTTP-EVIDENCE.md", "reports/GOVERNED-ROBOTS-COMPLETION.md", "reports/GOVERNED-SEED-ADMISSION.md", "reports/GOVERNED-SEED-DISPATCH.md"]
gaps: ["GAP-DOM-CRW", "GAP-004", "GAP-007", "GAP-041", "GAP-039", "GAP-042", "GAP-043", "GAP-044", "GAP-045", "GAP-046"]
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

- 2026-09-18 aftere937e79: [reviewed fixture retention](../../reports/REVIEWED-FIXTURE-RETENTION.md) progresses GAP-039 with exact retained-byte admission and legacy read/reuse checks; verification pending, full maturity unchanged.

- 2026-09-18: GAP-039 local admission/reuse closure verified:533 source/130 compiled tests and three actual browser paths. Full capability remains DEFINED/INCOMPLETE; customer retention and deployment are not certified.

- 2026-09-18 after42d88b3: [GAP-042](../gaps/GAP-042.md) progresses governed local bootstrap dispatch; verification pending and full maturity unchanged.

- 2026-09-18: [governed bootstrap report](../../reports/GOVERNED-HTTP-BOOTSTRAP.md) verifies GAP-042 local closure with547 source/109 compiled/2 actual Docker cases. Parent and full capability scope remain incomplete.

- 2026-09-18 afteraa8e9f7: [governed HTTP evidence](../../reports/GOVERNED-HTTP-EVIDENCE.md) progresses GAP-043; local acceptance verification pending. No full scope closure.

- 2026-09-19: GAP-043 local acceptance closed against [report](../../reports/GOVERNED-HTTP-EVIDENCE.md):568 source/110 compiled/1 actual Docker integration. Full capability and parent live scope remain incomplete.

- 2026-09-19 afterf5402a1: [governed robots completion](../../reports/GOVERNED-ROBOTS-COMPLETION.md) progresses GAP-044; verification pending, full capability maturity unchanged.

- 2026-09-19: GAP-044 closed locally against [report](../../reports/GOVERNED-ROBOTS-COMPLETION.md):584 source/89 compiled/1 actual Docker integration. Parent and full capability scope remain incomplete.

- 2026-09-19 after2ec8bc6: [seed admission](../../reports/GOVERNED-SEED-ADMISSION.md) progresses GAP-045; verification pending, full maturity unchanged.

- 2026-09-19: GAP-045 local seed admission closed against [report](../../reports/GOVERNED-SEED-ADMISSION.md):602 source/89 compiled/1 actual Docker integration. Full capability and live integration remain incomplete.

- 2026-09-19 after2976255: [governed seed dispatch](../../reports/GOVERNED-SEED-DISPATCH.md) progresses GAP-046; verification pending, full capability maturity unchanged.

- 2026-09-19: GAP-046 local dispatch closed against [report](../../reports/GOVERNED-SEED-DISPATCH.md):634 application/100 compiled/1 actual Docker integration. Parent live integration and full capability remain incomplete.
