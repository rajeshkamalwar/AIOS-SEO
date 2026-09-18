---
id: "GOVERNED-HTTP-BOOTSTRAP"
title: "Governed local HTTP bootstrap"
order: 28
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-042 local dispatch prerequisite only"
baseline: "parent42d88b3"
specs: ["docs/30-CRAWL-RENDER-CONTRACT.md", "docs/33-EVENT-JOB-CONTRACT.md", "docs/34-SECURITY-TENANCY-DATA.md", "docs/35-QUALITY-SELF-AUDIT-GATES.md", "docs/decisions/022-governed-local-http-bootstrap.md"]
implementation: ["packages/jobs/http-bootstrap-job.ts", "packages/jobs/index.ts", "packages/jobs/isolated-http-fixture-supervisor.ts", "packages/jobs/http-lane.ts", "packages/skills/http-bootstrap.ts", "packages/persistence/migrations/021-http-bootstrap-job.sql"]
tests: ["tests/http-bootstrap.test.ts", "tests/http-isolated.test.ts", "tests/http-fixture-broker.test.ts", "tests/http-fixture-engine.test.ts"]
reports: ["reports/GOVERNED-HTTP-BOOTSTRAP.md"]
gaps: ["GAP-042", "GAP-004", "GAP-005"]
evidence_date: "2026-09-18"
normal_tests: 547
compiled_tests: 109
docker_tests: 2
---


# Governed HTTP checkpoint

[Results and limits](../../reports/GOVERNED-HTTP-BOOTSTRAP.md). Verification passed for the local scope; no real-world maturity claim.

Verified scoped local prerequisite; no full-capability promotion.
