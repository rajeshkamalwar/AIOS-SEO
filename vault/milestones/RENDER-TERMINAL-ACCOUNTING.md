---
id: "RENDER-TERMINAL-ACCOUNTING"
title: "Independent render terminal accounting protocol"
order: 22
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-036 protocol only; actual governed container producer and evidence acceptance remain open"
baseline: "parent9620e9a"
specs: ["docs/30-CRAWL-RENDER-CONTRACT.md", "docs/33-EVENT-JOB-CONTRACT.md", "docs/decisions/016-render-terminal-accounting.md"]
implementation: ["packages/jobs/render-lane.ts", "packages/jobs/render-supervisor.ts", "packages/jobs/lease-context.ts", "packages/persistence/migrations/017-render-supervisor.sql"]
tests: ["tests/render-lane.test.ts", "scripts/test.mjs"]
reports: ["reports/RENDER-TERMINAL-ACCOUNTING.md"]
normal_tests: 431
compiled_tests: 71
docker_tests: null
evidence_date: "2026-09-18"
gaps: ["GAP-036", "GAP-008"]
---

# Render protocol checkpoint

[Actual results and limits](../../reports/RENDER-TERMINAL-ACCOUNTING.md). Independent test-role terminal witnesses are explicit protocol fixtures, not proof of actual container execution.
