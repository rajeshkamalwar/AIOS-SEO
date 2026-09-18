---
id: "CAP-JS-06"
title: "Blocked resource impact"
domain: "JS"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "foundation_only"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md"]
implementation: ["workers/render-fixture/worker.mjs", "workers/render-fixture/Dockerfile", "packages/perception/render-input.ts", "packages/perception/render-result.ts", "packages/perception/render-manifest.ts", "packages/persistence/migrations/010-render-records.sql", "packages/jobs/offline-render-source.ts", "packages/jobs/render-lane.ts", "packages/jobs/render-supervisor.ts", "packages/persistence/migrations/017-render-supervisor.sql", "packages/jobs/offline-render-producer.ts", "packages/jobs/docker-offline-render.ts", "packages/jobs/offline-render-job.ts", "packages/skills/offline-render.ts", "packages/persistence/migrations/018-offline-render-job.sql", "packages/jobs/offline-render-acceptance.ts", "packages/perception/render-retention.ts", "packages/perception/render-privacy.ts", "packages/perception/render-privacy-isolated.ts", "packages/persistence/migrations/019-offline-render-acceptance.sql", "packages/jobs/offline-render-projection.ts", "packages/persistence/migrations/020-offline-render-projection.sql"]
tests: ["scripts/test-render.mjs", "tests/render-input.test.ts", "tests/render-result.test.ts", "tests/render-manifest.test.ts", "tests/render-persistence.test.ts", "tests/offline-render-source.test.ts", "tests/render-lane.test.ts", "tests/render-execution.test.ts", "tests/render-acceptance.test.ts", "tests/render-privacy.test.ts", "tests/render-retention.test.ts", "tests/render-projection.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md", "reports/OFFLINE-RENDER-SOURCE-PREPARATION.md", "reports/RENDER-TERMINAL-ACCOUNTING.md", "reports/GOVERNED-OFFLINE-RENDER-EXECUTION.md", "reports/LOCAL-RENDER-EVIDENCE-ACCEPTANCE.md", "reports/LOCAL-RENDER-PROJECTION.md"]
gaps: ["GAP-DOM-JS", "GAP-008", "GAP-009", "GAP-035", "GAP-036", "GAP-037", "GAP-038", "GAP-039", "GAP-040"]
scope: "Offline worker records denied HTTP/socket/popup/resource diagnostics; strict receipt validation preserves measured fields."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-JS-06 — Blocked resource impact

Canonical responsibility: [CAP-JS-06](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `foundation_only` / `TESTED`.

Offline worker records denied HTTP/socket/popup/resource diagnostics; strict receipt validation preserves measured fields.

Implementation: [worker.mjs](../../workers/render-fixture/worker.mjs), [Dockerfile](../../workers/render-fixture/Dockerfile), [render-input.ts](../../packages/perception/render-input.ts), [render-result.ts](../../packages/perception/render-result.ts), [render-manifest.ts](../../packages/perception/render-manifest.ts), [010-render-records.sql](../../packages/persistence/migrations/010-render-records.sql)

Tests: [test-render.mjs](../../scripts/test-render.mjs), [render-input.test.ts](../../tests/render-input.test.ts), [render-result.test.ts](../../tests/render-result.test.ts), [render-manifest.test.ts](../../tests/render-manifest.test.ts), [render-persistence.test.ts](../../tests/render-persistence.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No critical-content dependency attribution or blocked-resource impact hypothesis; all offline egress is denied.

Open gaps: [GAP-DOM-JS](../gaps/GAP-DOM-JS.md), [GAP-008](../gaps/GAP-008.md), [GAP-009](../gaps/GAP-009.md).

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

- 2026-09-18 after359a01d: persisted-source preparation integration tracked by [GAP-035](../gaps/GAP-035.md). Verification pending in its [report](../../reports/OFFLINE-RENDER-SOURCE-PREPARATION.md); no maturity promotion or render authority.

- 2026-09-18: GAP-035 scoped preparation verified through419 application tests,73 compiled tests and14 browser scenarios; [report](../../reports/OFFLINE-RENDER-SOURCE-PREPARATION.md) distinguishes overlapping suites and local proof. Full capability maturity and completion unchanged.

- 2026-09-18 after9620e9a: [GAP-036](../gaps/GAP-036.md) adds accounting-only render bounds and independent supervisor receipts. Tests/report pending; actual producer and rendered-evidence acceptance remain open.

- 2026-09-18: GAP-036 accounting protocol verified with431 application and71 compiled tests. Independent supervisor fixtures protect permanent charges and once-only slot release; no actual producer or capability maturity promotion.

- 2026-09-18: [GAP-037](../gaps/GAP-037.md) verified actual governed local container execution with446 application/72 compiled tests and one actual Docker scenario. No accepted rendered evidence, full capability completion or real-world maturity inferred.

- 2026-09-18 afterd04ebff: GAP-038 implements privacy-limited collection acceptance; verification pending. GAP-039 separately tracks upstream raw retention. No full capability or real-world maturity promotion.

- 2026-09-18: GAP-038 scoped acceptance verified with477 application/88 compiled tests plus actual Docker artifact acceptance. Typed render projections, completed jobs and upstream raw privacy remain open; full capability status unchanged.

- 2026-09-18 after8a86864: GAP-040 adds typed projection/completion for already accepted local privacy-limited collections; verification pending. No resource URLs are reconstructed or SEO parity conclusions inferred.

- 2026-09-18: GAP-040 verified with487 application/85 compiled tests plus actual Docker-to-completed-job proof. Typed snapshots remain privacy-limited; no resource URLs, critical-text values or SEO conclusions are invented. Full capability maturity unchanged.
