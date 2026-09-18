---
id: "REVIEWED-FIXTURE-RETENTION"
title: "Reviewed synthetic raw retention and reuse"
order: 27
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-039 synthetic raw content/metadata admission and legacy reuse; no arbitrary customer privacy certification"
baseline: "parente937e79"
specs: ["docs/26-TEMPORAL-EVIDENCE-CONTRACT.md", "docs/30-CRAWL-RENDER-CONTRACT.md", "docs/34-SECURITY-TENANCY-DATA.md", "docs/decisions/021-reviewed-synthetic-raw-retention.md"]
implementation: ["packages/persistence/index.ts", "packages/jobs/offline-render-source.ts", "packages/perception/reviewed-fixtures.ts", "packages/jobs/frontier-context.ts", "packages/jobs/index.ts", "packages/api/index.ts"]
tests: ["tests/http-evidence.test.ts", "tests/offline-render-source.test.ts", "tests/reviewed-fixtures.test.ts", "tests/site-scope.test.ts", "tests/jobs.test.ts", "tests/render-acceptance.test.ts", "tests/render-projection.test.ts"]
reports: ["reports/REVIEWED-FIXTURE-RETENTION.md"]
gaps: ["GAP-039", "GAP-004", "GAP-008"]
normal_tests: 533
compiled_tests: 130
docker_tests: 3
evidence_date: "2026-09-18"
---

# Reviewed fixture retention

[Actual results and limits](../../reports/REVIEWED-FIXTURE-RETENTION.md). Local verification passed; three actual browser paths were exercised inside overlapping31/28/25-case suites. No real-world or production proof.
