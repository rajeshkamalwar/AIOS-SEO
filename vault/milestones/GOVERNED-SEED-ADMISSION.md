---
id: "GOVERNED-SEED-ADMISSION"
title: "Governed independent seed admission"
order: 31
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-045 local seed classification and successor evidence bundle"
baseline: "parent2ec8bc6"
specs: ["docs/26-TEMPORAL-EVIDENCE-CONTRACT.md", "docs/30-CRAWL-RENDER-CONTRACT.md", "docs/33-EVENT-JOB-CONTRACT.md", "docs/34-SECURITY-TENANCY-DATA.md", "docs/35-QUALITY-SELF-AUDIT-GATES.md", "docs/decisions/025-governed-local-seed-admission.md"]
implementation: ["packages/jobs/http-bootstrap-projection.ts", "packages/jobs/index.ts", "packages/jobs/http-bootstrap-seed.ts", "packages/persistence/migrations/024-http-bootstrap-seed.sql"]
tests: ["tests/http-bootstrap-projection.test.ts", "tests/http-bootstrap-seed.test.ts"]
reports: ["reports/GOVERNED-SEED-ADMISSION.md"]
gaps: ["GAP-045", "GAP-004"]
evidence_date: "2026-09-19"
normal_tests: 602
compiled_tests: 89
docker_tests: 1
---


# Governed seed checkpoint

[Results and limits](../../reports/GOVERNED-SEED-ADMISSION.md). Scoped implementation and verification passed; no page dispatch or full capability promotion.
