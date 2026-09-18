---
id: "CAP-AUDIT-03"
title: "Work and cost control"
domain: "AUDIT"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "partial_behavior"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md"]
implementation: ["packages/jobs/index.ts", "packages/jobs/http-lane.ts", "packages/jobs/http-fixture-supervisor.ts", "packages/perception/http-fixture-worker.ts", "packages/jobs/render-lane.ts", "packages/jobs/render-supervisor.ts", "packages/persistence/migrations/017-render-supervisor.sql", "packages/jobs/offline-render-producer.ts", "packages/jobs/docker-offline-render.ts", "packages/jobs/offline-render-job.ts", "packages/skills/offline-render.ts", "packages/persistence/migrations/018-offline-render-job.sql", "packages/jobs/offline-render-acceptance.ts", "packages/perception/render-retention.ts", "packages/perception/render-privacy.ts", "packages/perception/render-privacy-isolated.ts", "packages/persistence/migrations/019-offline-render-acceptance.sql", "packages/jobs/offline-render-projection.ts", "packages/persistence/migrations/020-offline-render-projection.sql", "packages/jobs/isolated-http-fixture-supervisor.ts", "packages/jobs/docker-http-fixture.ts", "packages/perception/http-fixture-broker.ts"]
tests: ["tests/jobs.test.ts", "tests/http-lane.test.ts", "tests/render-lane.test.ts", "tests/render-execution.test.ts", "tests/render-acceptance.test.ts", "tests/render-privacy.test.ts", "tests/render-retention.test.ts", "tests/render-projection.test.ts", "tests/http-isolated.test.ts", "tests/http-fixture-broker.test.ts"]
reports: ["reports/HTTP-TERMINAL-AUTHORITY.md", "docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md", "reports/HTTP-FIXTURE-PROCESS-SUPERVISION.md", "reports/RENDER-TERMINAL-ACCOUNTING.md", "reports/GOVERNED-OFFLINE-RENDER-EXECUTION.md", "reports/LOCAL-RENDER-EVIDENCE-ACCEPTANCE.md", "reports/LOCAL-RENDER-PROJECTION.md", "reports/ISOLATED-HTTP-EGRESS.md"]
gaps: ["GAP-005", "GAP-DOM-AUDIT", "GAP-015", "GAP-034", "GAP-036", "GAP-037", "GAP-038", "GAP-039", "GAP-040", "GAP-041"]
scope: "Durable job attempts/leases/deadlines, cancellation/retry limits and conservative global HTTP slot/request/byte accounting including crash recovery tests."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-AUDIT-03 — Work and cost control

Canonical responsibility: [CAP-AUDIT-03](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `partial_behavior` / `TESTED`.

Durable job attempts/leases/deadlines, cancellation/retry limits and conservative global HTTP slot/request/byte accounting including crash recovery tests.

Implementation: [index.ts](../../packages/jobs/index.ts), [http-lane.ts](../../packages/jobs/http-lane.ts)

Tests: [jobs.test.ts](../../tests/jobs.test.ts), [http-lane.test.ts](../../tests/http-lane.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No full live lane dispatch/worker-stop reconciliation or deployed runaway-monitoring system; unknown slots remain fail-closed.

Open gaps: [GAP-DOM-AUDIT](../gaps/GAP-DOM-AUDIT.md), [GAP-015](../gaps/GAP-015.md).

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

- 2026-09-18: [HTTP terminal protocol](../../reports/HTTP-TERMINAL-AUTHORITY.md) requires independently authenticated invocation and terminal accounting. Actual process/egress producer remains [GAP-005](../gaps/GAP-005.md); full capability maturity unchanged.

- 2026-09-18: actual fixed local child and loopback socket lifecycle tested in [process-supervision report](../../reports/HTTP-FIXTURE-PROCESS-SUPERVISION.md). No public dispatch, general process-tree sandbox or real-world maturity claim.

- 2026-09-18 after9620e9a: [GAP-036](../gaps/GAP-036.md) adds accounting-only render bounds and independent supervisor receipts. Tests/report pending; actual producer and rendered-evidence acceptance remain open.

- 2026-09-18: GAP-036 accounting protocol verified with431 application and71 compiled tests. Independent supervisor fixtures protect permanent charges and once-only slot release; no actual producer or capability maturity promotion.

- 2026-09-18: [GAP-037](../gaps/GAP-037.md) verified actual governed local container execution with446 application/72 compiled tests and one actual Docker scenario. No accepted rendered evidence, full capability completion or real-world maturity inferred.

- 2026-09-18 afterd04ebff: GAP-038 implements privacy-limited collection acceptance; verification pending. GAP-039 separately tracks upstream raw retention. No full capability or real-world maturity promotion.

- 2026-09-18: GAP-038 scoped acceptance verified with477 application/88 compiled tests plus actual Docker artifact acceptance. Typed render projections, completed jobs and upstream raw privacy remain open; full capability status unchanged.

- 2026-09-18 after8a86864: GAP-040 adds typed projection/completion for already accepted local privacy-limited collections; verification pending. No resource URLs are reconstructed or SEO parity conclusions inferred.

- 2026-09-18: GAP-040 verified with487 application/85 compiled tests plus actual Docker-to-completed-job proof. Typed snapshots remain privacy-limited; no resource URLs, critical-text values or SEO conclusions are invented. Full capability maturity unchanged.

- 2026-09-18 after6131ee2: isolated local HTTP prerequisite under implementation; [GAP-041](../gaps/GAP-041.md) and its report track verification. Full capability maturity unchanged.

- 2026-09-18: [isolated HTTP report](../../reports/ISOLATED-HTTP-EGRESS.md) verifies GAP-041 local prerequisite (509 source/97 compiled/2 actual Docker cases). No full-capability maturity promotion.
