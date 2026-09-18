---
id: "GOVERNED-OFFLINE-RENDER-EXECUTION"
title: "Governed local isolated render execution"
order: 23
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-037 actual local fixture execution only; no evidence acceptance or completed render job"
baseline: "parentf9543a8"
specs: ["docs/30-CRAWL-RENDER-CONTRACT.md", "docs/33-EVENT-JOB-CONTRACT.md", "docs/decisions/017-governed-local-render-execution.md"]
implementation: ["packages/jobs/offline-render-producer.ts", "packages/jobs/docker-offline-render.ts", "packages/jobs/offline-render-job.ts", "packages/skills/offline-render.ts", "packages/persistence/migrations/018-offline-render-job.sql"]
tests: ["tests/render-execution.test.ts", "scripts/test.mjs"]
reports: ["reports/GOVERNED-OFFLINE-RENDER-EXECUTION.md"]
normal_tests: 446
compiled_tests: 72
docker_tests: 1
evidence_date: "2026-09-18"
gaps: ["GAP-037", "GAP-008"]
---

# Governed local render checkpoint

[Actual results and limits](../../reports/GOVERNED-OFFLINE-RENDER-EXECUTION.md). One actual Docker scenario; the complete opt-in suite has28 cases including27 normal-suite overlaps. Fixture execution remains TESTED, never real-world or production proof.
