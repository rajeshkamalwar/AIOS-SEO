---
id: "ISOLATED-HTTP-EGRESS"
title: "Isolated local HTTP egress mediation"
order: 26
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-041 local isolated collector and trusted one-hop broker; not public collection"
baseline: "parent6131ee2"
specs: ["docs/30-CRAWL-RENDER-CONTRACT.md", "docs/33-EVENT-JOB-CONTRACT.md", "docs/34-SECURITY-TENANCY-DATA.md", "docs/decisions/020-local-http-egress-mediation.md"]
implementation: ["packages/jobs/isolated-http-fixture-supervisor.ts", "packages/jobs/docker-http-fixture.ts", "packages/perception/http-fixture-broker.ts", "packages/perception/transport.ts", "workers/http-fixture/worker.mjs"]
tests: ["tests/http-isolated.test.ts", "tests/http-fixture-broker.test.ts", "tests/http-fixture-engine.test.ts"]
reports: ["reports/ISOLATED-HTTP-EGRESS.md"]
gaps: ["GAP-041", "GAP-007", "GAP-004", "GAP-005"]
normal_tests: 509
compiled_tests: 97
docker_tests: 2
evidence_date: "2026-09-18"
---

# Isolated HTTP checkpoint

[Actual results and limits](../../reports/ISOLATED-HTTP-EGRESS.md). Two actual Docker cases;38-case opt-in suite contains36 protocol overlaps. Local fixture proof remains TESTED.
