---
id: "PUBLICATION-SCOPE-HARDENING"
title: "Suppress ungoverned publication and authorize exact run sites"
order: 18
maturity: "TESTED"
status: "SCOPED_LOCAL_EXIT_VERIFIED"
scope: "GAP-031/GAP-032 closure; GAP-030/GAP-015 independent publication still open"
baseline: "parent cd4a9d3"
specs: ["docs/35-QUALITY-SELF-AUDIT-GATES.md", "docs/37-IMPLEMENTATION-ARCHITECTURE.md", "docs/decisions/013-unverified-publication-suppression.md"]
implementation: ["packages/api/index.ts", "packages/persistence/migrations/015-publication-authority.sql"]
tests: ["tests/jobs.test.ts", "tests/api-scope.test.ts"]
reports: ["reports/PUBLICATION-AND-READ-SCOPE-HARDENING.md"]
normal_tests: 389
compiled_tests: 45
docker_tests: null
evidence_date: "2026-09-18"
gaps: ["GAP-031", "GAP-032", "GAP-030", "GAP-015"]
---

# Publication and scoped access checkpoint

[Actual results](../../reports/PUBLICATION-AND-READ-SCOPE-HARDENING.md). 389 application tests are383 main cases including12 nested role cases plus6 isolated scope cases. No successful governed publication or production readiness is implied.
