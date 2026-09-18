---
id: "GOVERNED-HTTP-EVIDENCE"
title: "Governed local HTTP evidence acceptance"
order: 29
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-043 local evidence acceptance prerequisite"
baseline: "parentaa8e9f7"
specs: ["docs/26-TEMPORAL-EVIDENCE-CONTRACT.md", "docs/29-SENSOR-CONNECTOR-CONTRACT.md", "docs/30-CRAWL-RENDER-CONTRACT.md", "docs/33-EVENT-JOB-CONTRACT.md", "docs/34-SECURITY-TENANCY-DATA.md", "docs/35-QUALITY-SELF-AUDIT-GATES.md", "docs/decisions/023-governed-local-http-evidence.md"]
implementation: ["packages/jobs/isolated-http-fixture-supervisor.ts", "packages/perception/http-fixture-broker.ts", "packages/jobs/http-bootstrap-acceptance.ts", "packages/perception/reviewed-fixtures.ts", "packages/persistence/migrations/022-http-bootstrap-acceptance.sql"]
tests: ["tests/http-isolated.test.ts", "tests/http-acceptance.test.ts", "tests/http-fixture-broker.test.ts", "tests/reviewed-fixtures.test.ts"]
reports: ["reports/GOVERNED-HTTP-EVIDENCE.md"]
gaps: ["GAP-043", "GAP-004", "GAP-005"]
evidence_date: "2026-09-19"
normal_tests: 568
compiled_tests: 110
docker_tests: 1
---



# Governed HTTP evidence checkpoint

[Results and limits](../../reports/GOVERNED-HTTP-EVIDENCE.md). Scoped verification passed; no full capability promotion.

Verified local-only checkpoint; parent N1 remains in progress.
