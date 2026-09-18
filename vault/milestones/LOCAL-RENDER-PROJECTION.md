---
id: "LOCAL-RENDER-PROJECTION"
title: "Typed local render projection and atomic completion"
order: 25
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-040 typed policy-limited snapshots and completed local render job; no resource URL reconstruction or SEO parity claim"
baseline: "parent8a86864"
specs: ["docs/26-TEMPORAL-EVIDENCE-CONTRACT.md", "docs/30-CRAWL-RENDER-CONTRACT.md", "docs/33-EVENT-JOB-CONTRACT.md", "docs/decisions/019-local-render-projection-completion.md"]
implementation: ["packages/jobs/offline-render-projection.ts", "packages/jobs/offline-render-producer.ts", "packages/persistence/migrations/020-offline-render-projection.sql"]
tests: ["tests/render-projection.test.ts", "scripts/test.mjs"]
reports: ["reports/LOCAL-RENDER-PROJECTION.md"]
normal_tests: 487
compiled_tests: 85
docker_tests: 1
evidence_date: "2026-09-18"
gaps: ["GAP-040", "GAP-008", "GAP-039"]
---

# Typed render checkpoint

[Actual results and limits](../../reports/LOCAL-RENDER-PROJECTION.md). One actual Docker completed-job scenario;25-case opt-in suite includes24 protocol overlaps. Local fixture proof remains TESTED.
