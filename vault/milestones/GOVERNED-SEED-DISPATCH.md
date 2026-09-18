---
id: "GOVERNED-SEED-DISPATCH"
title: "Governed submitted-page dispatch"
order: 32
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-046 local dispatch prerequisite"
baseline: "parent2976255"
specs: ["docs/30-CRAWL-RENDER-CONTRACT.md", "docs/33-EVENT-JOB-CONTRACT.md", "docs/34-SECURITY-TENANCY-DATA.md", "docs/35-QUALITY-SELF-AUDIT-GATES.md", "docs/decisions/026-governed-local-seed-dispatch.md"]
implementation: ["packages/jobs/isolated-http-seed-fixture-supervisor.ts", "packages/perception/http-seed-fixture-broker.ts", "packages/perception/http-fixture-broker-core.ts", "packages/skills/http-seed.ts", "packages/jobs/http-seed-job.ts", "packages/jobs/http-bootstrap-seed.ts", "packages/jobs/index.ts", "packages/jobs/http-lane.ts", "packages/persistence/migrations/025-http-seed-job.sql"]
tests: ["tests/http-seed.test.ts", "tests/http-seed-fixture-broker.test.ts"]
reports: ["reports/GOVERNED-SEED-DISPATCH.md"]
gaps: ["GAP-046", "GAP-004"]
evidence_date: "2026-09-19"
normal_tests: 634
compiled_tests: 100
docker_tests: 1
---

# Governed seed dispatch checkpoint

[Results and limits](../../reports/GOVERNED-SEED-DISPATCH.md). Scoped implementation and verification passed; Evidence acceptance and full capability remain incomplete.
