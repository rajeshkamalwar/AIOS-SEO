# Governed submitted-seed admission

Baseline: `2ec8bc6`. [ADR-025](../docs/decisions/025-governed-local-seed-admission.md) defines this bounded local scope.

The scheduler independently classifies the persisted submitted target from the exact completed robots acceptance/projection chain. It rechecks current authority, audit, deletion, freshness and retained artifacts before atomically freezing a successor input bundle, recording provenance and emitting the target classification event. Denied/disallowed targets are excluded; unknown or capacity-exhausted targets are deferred. No sitemap is fabricated.

Replay authenticates the original attempt and immutable source/support/bundle. It returns historical admission without resetting later target progress. Existing sitemap/link entry points now share the same pinned robots context, including direct SQL paths. Artifact reads remain outside work/clock locks. No page fetch, successor job, PageSnapshot, crawl completion or public/customer/write authority is added.

## Verification — 2026-09-19

- Full `npm test`: **602 application tests passed** (596 primary plus 6 API); 10 vault guard tests are separate.
- Focused seed source and compiled suites: **28/28 each**. Other compiled regressions: **61/61**; combined compiled coverage 89, not additional product capabilities.
- Actual isolated Docker suite: **29/29**, comprising the 28 overlapping cases and one actual container integration. The fixed local broker receives exactly `/robots.txt`; accepted robots evidence is projected and the seed classified without fetching its page.
- Typecheck and build passed. Specification validation passed: 27 schemas, 1089 references, 42 positive/15 negative examples, 11 skill manifests, 189 document links.
- Production dependency audits passed with zero vulnerabilities for root and render worker.
- Independent review found no remaining concrete scoped defect after shared robots-context correction.

Regression coverage includes concurrent and PostgreSQL-restart replay, source/terminal corruption, original attempt proof, current revocation/cancellation/deletion/audit/freshness, pre/post-artifact-read checks, immutable provenance, later target progress, 500-target capacity, cross-path robots mismatch, restricted roles/direct SQL and atomic event-failure rollback.

Initial runs exposed a missing composite bundle uniqueness constraint and an ambiguous PL/pgSQL `seq` reference; both were corrected. Freshness and JSONB test setup errors were corrected without weakening application guards. Integration review also found that existing sitemap/link paths omitted the new seed robots context; shared service/SQL checks and regressions now cover it.

Execution logs: `/tmp/aios-seed-admission-full.log`, `/tmp/aios-http-seed-test.log`, `/tmp/aios-http-seed-compiled.log`, `/tmp/aios-http-seed-docker.log`, `/tmp/aios-seed-compiled-other.log`. These are local execution logs, not production receipts.

This closes only GAP-045. GAP-004 remains open: governed page dispatch/acceptance/projection, live activation and broader recovery remain dependencies. Fixture PostgreSQL/container execution is TESTED, not REAL_WORLD_VERIFIED or PRODUCTION_PROVEN.
