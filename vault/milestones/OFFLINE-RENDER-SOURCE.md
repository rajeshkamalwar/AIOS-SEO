---
id: "OFFLINE-RENDER-SOURCE"
title: "Persisted-source offline render preparation"
order: 21
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-035 local source bridge; render admission/accounting/invocation/acceptance remain open"
baseline: "parent359a01d"
specs: ["docs/26-TEMPORAL-EVIDENCE-CONTRACT.md", "docs/30-CRAWL-RENDER-CONTRACT.md", "docs/33-EVENT-JOB-CONTRACT.md"]
implementation: ["packages/jobs/index.ts", "packages/jobs/offline-render-source.ts"]
tests: ["tests/offline-render-source.test.ts", "scripts/test.mjs", "scripts/test-render.mjs"]
reports: ["reports/OFFLINE-RENDER-SOURCE-PREPARATION.md"]
normal_tests: 419
compiled_tests: 73
docker_tests: 14
evidence_date: "2026-09-18"
gaps: ["GAP-035", "GAP-008", "GAP-009"]
---

# Persisted-source preparation checkpoint

[Actual results and overlapping test counts](../../reports/OFFLINE-RENDER-SOURCE-PREPARATION.md). The database-to-browser path uses synthetic retained sources and isolated offline Chromium. No real-world capability proof.
