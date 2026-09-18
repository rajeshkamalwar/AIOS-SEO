---
id: "HTTP-FIXTURE-PROCESS"
title: "Observed local HTTP child and socket lifecycle"
order: 20
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-034 fixed local producer; public dispatch, production egress and evidence acceptance remain open"
baseline: "parent05a0760"
specs: ["docs/30-CRAWL-RENDER-CONTRACT.md", "docs/33-EVENT-JOB-CONTRACT.md", "docs/decisions/015-local-http-process-supervision.md"]
implementation: ["packages/jobs/http-fixture-supervisor.ts", "packages/perception/http-fixture-worker.ts"]
tests: ["tests/http-lane.test.ts", "scripts/test.mjs"]
reports: ["reports/HTTP-FIXTURE-PROCESS-SUPERVISION.md"]
normal_tests: 405
compiled_tests: 84
docker_tests: null
evidence_date: "2026-09-18"
gaps: ["GAP-034", "GAP-005", "GAP-004", "GAP-007"]
---

# Local process checkpoint

[Actual results and limitations](../../reports/HTTP-FIXTURE-PROCESS-SUPERVISION.md). No public collection or accepted SEO evidence introduced.
