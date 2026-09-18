---
id: "HTTP-TERMINAL-AUTHORITY"
title: "Independent HTTP invocation and terminal accounting protocol"
order: 19
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-033 local authority closure; GAP-005 actual process/egress producer remains open"
baseline: "parent dc7ce96"
specs: ["docs/30-CRAWL-RENDER-CONTRACT.md", "docs/33-EVENT-JOB-CONTRACT.md", "docs/decisions/014-http-terminal-authority.md"]
implementation: ["packages/jobs/http-lane.ts", "packages/jobs/http-supervisor.ts", "packages/persistence/migrations/016-http-supervisor.sql"]
tests: ["tests/http-lane.test.ts"]
reports: ["reports/HTTP-TERMINAL-AUTHORITY.md"]
normal_tests: 397
compiled_tests: 45
docker_tests: null
evidence_date: "2026-09-18"
gaps: ["GAP-033", "GAP-005", "GAP-004"]
---

# HTTP terminal authority checkpoint

[Actual scope and results](../../reports/HTTP-TERMINAL-AUTHORITY.md). Test supervisor fixtures are explicit; actual process/egress producer and live dispatcher remain open.
