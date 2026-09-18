---
id: "LOCAL-RENDER-EVIDENCE-ACCEPTANCE"
title: "Privacy-limited local rendered evidence acceptance"
order: 24
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-038 accepted transformed Evidence/Observation only; typed render projections and job completion remain open"
baseline: "parentd04ebff"
specs: ["docs/26-TEMPORAL-EVIDENCE-CONTRACT.md", "docs/30-CRAWL-RENDER-CONTRACT.md", "docs/34-SECURITY-TENANCY-DATA.md", "docs/decisions/018-local-render-evidence-retention.md"]
implementation: ["packages/jobs/offline-render-acceptance.ts", "packages/perception/render-retention.ts", "packages/perception/render-privacy.ts", "packages/perception/render-privacy-isolated.ts", "packages/persistence/migrations/019-offline-render-acceptance.sql"]
tests: ["tests/render-acceptance.test.ts", "tests/render-privacy.test.ts", "tests/render-retention.test.ts"]
reports: ["reports/LOCAL-RENDER-EVIDENCE-ACCEPTANCE.md"]
normal_tests: 477
compiled_tests: 88
docker_tests: 1
evidence_date: "2026-09-18"
gaps: ["GAP-038", "GAP-039", "GAP-008"]
---

# Local rendered evidence checkpoint

[Actual results and limits](../../reports/LOCAL-RENDER-EVIDENCE-ACCEPTANCE.md). One actual Docker scenario within28-case opt-in suite. This is synthetic fixture evidence, not real-world validation.
