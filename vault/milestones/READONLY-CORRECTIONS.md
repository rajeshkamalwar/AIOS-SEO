---
id: "READONLY-CORRECTIONS"
title: "Post-vault API deadline and graph integrity corrections"
order: 16
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-025/GAP-026 local defects and vault guards only; no full capability completion"
baseline: "containing commit; parent673a11b"
specs: ["docs/27-KNOWLEDGE-GRAPH-CONTRACT.md", "docs/30-CRAWL-RENDER-CONTRACT.md", "docs/33-EVENT-JOB-CONTRACT.md", "docs/37-IMPLEMENTATION-ARCHITECTURE.md"]
implementation: ["packages/api/index.ts", "packages/jobs/index.ts", "packages/understanding/index.ts", "vault/refresh.py"]
tests: ["tests/jobs.test.ts", "tests/understanding.test.ts", "vault/test_refresh.py"]
reports: ["reports/POST-VAULT-READONLY-CORRECTIONS.md"]
normal_tests: 357
compiled_tests: 33
docker_tests: null
evidence_date: "2026-09-18"
gaps: ["GAP-025", "GAP-026", "GAP-028", "GAP-029"]
---

# Post-vault read-only correction checkpoint

The vault baseline was committed/pushed before these fixes. [Actual results and scope](../../reports/POST-VAULT-READONLY-CORRECTIONS.md) record failing regressions, corrections, independent review and full local checks.

357normal tests,33compiled tests and final10vault guard tests pass. Docker code is unchanged;13Docker regressions remain historical N1 evidence, not a rerun. GAP-025, GAP-026 and the tooling-only GAP-029 close only the named local defects. GAP-028 and N0/N1/full-capability delivery gaps remain open. The five state views are regenerated in this same checkpoint; no maturity or external authority was promoted.
