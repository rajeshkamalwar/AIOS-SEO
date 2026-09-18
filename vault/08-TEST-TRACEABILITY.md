# Test traceability

<!-- Derived record/source digest: 8cbd0c215d714ad70f6a22bece840f347ef17c187176afa5a6ed9f248bad669e; regenerate with npm run vault:update. This is not a test receipt. -->

Counts below are successive snapshots, **never added together**. A referenced test is not proof of full capability acceptance. Fixture/loopback/offline browser results stay TESTED. Spec validation, production dependency audit and runtime execution establish different things.

| Requirement / checkpoint | Implementation | Tests / conformance artifacts | Actual report / baseline |
| --- | --- | --- | --- |
| [VISION](milestones/VISION.md) | — | — | [00-CONSTITUTION.md](../docs/00-CONSTITUTION.md), [01-CANONICAL-VISION.md](../docs/01-CANONICAL-VISION.md) / 00609f6 |
| [PHASE-1](milestones/PHASE-1.md) | — | — | [07-ARCHITECTURE-READINESS-REVIEW.md](../docs/07-ARCHITECTURE-READINESS-REVIEW.md), [13-IMPLEMENTATION-DEPENDENCIES.md](../docs/13-IMPLEMENTATION-DEPENDENCIES.md) / baf1f07 |
| [PHASE-2](milestones/PHASE-2.md) | — | [validate.py](../spec/validate.py) | [23-PHASE-2-GAP-REVIEW.md](../docs/23-PHASE-2-GAP-REVIEW.md) / a6d2a3f |
| [PHASE-3](milestones/PHASE-3.md) | — | [validate.py](../spec/validate.py) | [39-PHASE-3-READINESS-REVIEW.md](../docs/39-PHASE-3-READINESS-REVIEW.md) / 0f3fdf9 |
| [M1](milestones/M1.md) | [index.ts](../packages/persistence/index.ts), [index.ts](../packages/evidence/index.ts) | [foundation.test.ts](../tests/foundation.test.ts), [blob.test.ts](../tests/blob.test.ts) | [M1-IMPLEMENTATION.md](../reports/M1-IMPLEMENTATION.md) / cca89ed |
| [ADR-007](milestones/ADR-007.md) | [index.ts](../packages/policy/index.ts) | [policy.test.ts](../tests/policy.test.ts), [audit-transitions.json](../spec/fixtures/audit-transitions.json) | [M2-IMPLEMENTATION.md](../reports/M2-IMPLEMENTATION.md) / 5f807bb |
| [M2](milestones/M2.md) | [index.ts](../packages/jobs/index.ts), [index.ts](../packages/skills/index.ts), [index.ts](../packages/policy/index.ts) | [jobs.test.ts](../tests/jobs.test.ts), [policy.test.ts](../tests/policy.test.ts) | [M2-IMPLEMENTATION.md](../reports/M2-IMPLEMENTATION.md) / e78d956 |
| [M3](milestones/M3.md) | [index.ts](../packages/perception/index.ts) | [perception.test.ts](../tests/perception.test.ts) | [M3-IMPLEMENTATION.md](../reports/M3-IMPLEMENTATION.md) / 136b86b |
| [M4](milestones/M4.md) | [index.ts](../packages/understanding/index.ts) | [understanding.test.ts](../tests/understanding.test.ts) | [M4-IMPLEMENTATION.md](../reports/M4-IMPLEMENTATION.md) / 9664017 |
| [M5](milestones/M5.md) | [index.ts](../packages/api/index.ts), [index.html](../apps/web/index.html), [003-readonly-publication.sql](../packages/persistence/migrations/003-readonly-publication.sql) | [api.test.ts](../tests/api.test.ts) | [M5-IMPLEMENTATION.md](../reports/M5-IMPLEMENTATION.md) / 3cacf74 |
| [POST-M5](milestones/POST-M5.md) | [index.ts](../packages/api/index.ts) | [api.test.ts](../tests/api.test.ts) | [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md) / 9221987 |
| [N0](milestones/N0.md) | [index.ts](../packages/runtime/index.ts) | [runtime.test.ts](../tests/runtime.test.ts) | [N0-IMPLEMENTATION.md](../docs/reports/N0-IMPLEMENTATION.md) / dc9ed0c |
| [N1](milestones/N1.md) | [collector.ts](../packages/perception/collector.ts), [frontier.ts](../packages/jobs/frontier.ts), [frontier-links.ts](../packages/jobs/frontier-links.ts), [render-manifest.ts](../packages/perception/render-manifest.ts), [input-eligibility.ts](../packages/policy/input-eligibility.ts), [worker.mjs](../workers/render-fixture/worker.mjs) | [api.test.ts](../tests/api.test.ts), [blob.test.ts](../tests/blob.test.ts), [collector.test.ts](../tests/collector.test.ts), [contracts.test.ts](../tests/contracts.test.ts), [decoding.test.ts](../tests/decoding.test.ts), [dom-isolated.test.ts](../tests/dom-isolated.test.ts), [dom.test.ts](../tests/dom.test.ts), [foundation.test.ts](../tests/foundation.test.ts), [frontier-links.test.ts](../tests/frontier-links.test.ts), [frontier-persistence.test.ts](../tests/frontier-persistence.test.ts), [http-evidence.test.ts](../tests/http-evidence.test.ts), [http-lane.test.ts](../tests/http-lane.test.ts), [input-eligibility.test.ts](../tests/input-eligibility.test.ts), [jobs.test.ts](../tests/jobs.test.ts), [perception-persistence.test.ts](../tests/perception-persistence.test.ts), [perception.test.ts](../tests/perception.test.ts), [policy.test.ts](../tests/policy.test.ts), [render-input.test.ts](../tests/render-input.test.ts), [render-manifest.test.ts](../tests/render-manifest.test.ts), [render-persistence.test.ts](../tests/render-persistence.test.ts), [render-result.test.ts](../tests/render-result.test.ts), [robots.test.ts](../tests/robots.test.ts), [runtime.test.ts](../tests/runtime.test.ts), [site-scope.test.ts](../tests/site-scope.test.ts), [sitemap-index-persistence.test.ts](../tests/sitemap-index-persistence.test.ts), [sitemap.test.ts](../tests/sitemap.test.ts), [understanding.test.ts](../tests/understanding.test.ts), [test-render.mjs](../scripts/test-render.mjs) | [N1-IMPLEMENTATION.md](../docs/reports/N1-IMPLEMENTATION.md) / 2b6d527 |
| [N2](milestones/N2.md) | — | — | [41-NEXT-PHASE-READINESS-PLAN.md](../docs/41-NEXT-PHASE-READINESS-PLAN.md) / None |
| [N3](milestones/N3.md) | — | — | [41-NEXT-PHASE-READINESS-PLAN.md](../docs/41-NEXT-PHASE-READINESS-PLAN.md) / None |
| [VAULT-BASELINE](milestones/VAULT-BASELINE.md) | [refresh.py](../vault/refresh.py) | [refresh.py](../vault/refresh.py), [validate.py](../spec/validate.py) | [VAULT-BASELINE.md](../vault/milestones/VAULT-BASELINE.md) / 2b6d527 |
| [READONLY-CORRECTIONS](milestones/READONLY-CORRECTIONS.md) | [index.ts](../packages/api/index.ts), [index.ts](../packages/jobs/index.ts), [index.ts](../packages/understanding/index.ts), [refresh.py](../vault/refresh.py) | [jobs.test.ts](../tests/jobs.test.ts), [understanding.test.ts](../tests/understanding.test.ts), [test_refresh.py](../vault/test_refresh.py) | [POST-VAULT-READONLY-CORRECTIONS.md](../reports/POST-VAULT-READONLY-CORRECTIONS.md) / containing commit; parent673a11b |
| [API-CONTRACT-CORRECTIONS](milestones/API-CONTRACT-CORRECTIONS.md) | [index.ts](../packages/api/index.ts), [index.ts](../packages/jobs/index.ts) | [api.test.ts](../tests/api.test.ts), [jobs.test.ts](../tests/jobs.test.ts) | [API-CONTRACT-CORRECTIONS.md](../reports/API-CONTRACT-CORRECTIONS.md) / parent d7b721b |
| [PUBLICATION-SCOPE-HARDENING](milestones/PUBLICATION-SCOPE-HARDENING.md) | [index.ts](../packages/api/index.ts), [015-publication-authority.sql](../packages/persistence/migrations/015-publication-authority.sql) | [jobs.test.ts](../tests/jobs.test.ts), [api-scope.test.ts](../tests/api-scope.test.ts) | [PUBLICATION-AND-READ-SCOPE-HARDENING.md](../reports/PUBLICATION-AND-READ-SCOPE-HARDENING.md) / parent cd4a9d3 |
| [HTTP-TERMINAL-AUTHORITY](milestones/HTTP-TERMINAL-AUTHORITY.md) | [http-lane.ts](../packages/jobs/http-lane.ts), [http-supervisor.ts](../packages/jobs/http-supervisor.ts), [016-http-supervisor.sql](../packages/persistence/migrations/016-http-supervisor.sql) | [http-lane.test.ts](../tests/http-lane.test.ts) | [HTTP-TERMINAL-AUTHORITY.md](../reports/HTTP-TERMINAL-AUTHORITY.md) / parent dc7ce96 |
| [HTTP-FIXTURE-PROCESS](milestones/HTTP-FIXTURE-PROCESS.md) | [http-fixture-supervisor.ts](../packages/jobs/http-fixture-supervisor.ts), [http-fixture-worker.ts](../packages/perception/http-fixture-worker.ts) | [http-lane.test.ts](../tests/http-lane.test.ts), [test.mjs](../scripts/test.mjs) | [HTTP-FIXTURE-PROCESS-SUPERVISION.md](../reports/HTTP-FIXTURE-PROCESS-SUPERVISION.md) / parent05a0760 |
| [OFFLINE-RENDER-SOURCE](milestones/OFFLINE-RENDER-SOURCE.md) | [index.ts](../packages/jobs/index.ts), [offline-render-source.ts](../packages/jobs/offline-render-source.ts) | [offline-render-source.test.ts](../tests/offline-render-source.test.ts), [test.mjs](../scripts/test.mjs), [test-render.mjs](../scripts/test-render.mjs) | [OFFLINE-RENDER-SOURCE-PREPARATION.md](../reports/OFFLINE-RENDER-SOURCE-PREPARATION.md) / parent359a01d |
| [RENDER-TERMINAL-ACCOUNTING](milestones/RENDER-TERMINAL-ACCOUNTING.md) | [render-lane.ts](../packages/jobs/render-lane.ts), [render-supervisor.ts](../packages/jobs/render-supervisor.ts), [lease-context.ts](../packages/jobs/lease-context.ts), [017-render-supervisor.sql](../packages/persistence/migrations/017-render-supervisor.sql) | [render-lane.test.ts](../tests/render-lane.test.ts), [test.mjs](../scripts/test.mjs) | [RENDER-TERMINAL-ACCOUNTING.md](../reports/RENDER-TERMINAL-ACCOUNTING.md) / parent9620e9a |

## Capability and defect trace

Every [capability note](04-COVERAGE-MATRIX.md) maps its exact CAP requirement → partial implementation → tests → report → maturity → persistent gaps. Every [gap note](05-GAP-REGISTER.md) records closure criteria and history; a current-stage test cannot silently close a broader scope.

## Current test-file inventory

- [api-scope.test.ts](../tests/api-scope.test.ts)
- [api.test.ts](../tests/api.test.ts)
- [blob.test.ts](../tests/blob.test.ts)
- [collector.test.ts](../tests/collector.test.ts)
- [contracts.test.ts](../tests/contracts.test.ts)
- [decoding.test.ts](../tests/decoding.test.ts)
- [dom-isolated.test.ts](../tests/dom-isolated.test.ts)
- [dom.test.ts](../tests/dom.test.ts)
- [foundation.test.ts](../tests/foundation.test.ts)
- [frontier-links.test.ts](../tests/frontier-links.test.ts)
- [frontier-persistence.test.ts](../tests/frontier-persistence.test.ts)
- [http-evidence.test.ts](../tests/http-evidence.test.ts)
- [http-lane.test.ts](../tests/http-lane.test.ts)
- [input-eligibility.test.ts](../tests/input-eligibility.test.ts)
- [jobs.test.ts](../tests/jobs.test.ts)
- [offline-render-source.test.ts](../tests/offline-render-source.test.ts)
- [perception-persistence.test.ts](../tests/perception-persistence.test.ts)
- [perception.test.ts](../tests/perception.test.ts)
- [policy.test.ts](../tests/policy.test.ts)
- [render-input.test.ts](../tests/render-input.test.ts)
- [render-lane.test.ts](../tests/render-lane.test.ts)
- [render-manifest.test.ts](../tests/render-manifest.test.ts)
- [render-persistence.test.ts](../tests/render-persistence.test.ts)
- [render-result.test.ts](../tests/render-result.test.ts)
- [robots.test.ts](../tests/robots.test.ts)
- [runtime.test.ts](../tests/runtime.test.ts)
- [site-scope.test.ts](../tests/site-scope.test.ts)
- [sitemap-index-persistence.test.ts](../tests/sitemap-index-persistence.test.ts)
- [sitemap.test.ts](../tests/sitemap.test.ts)
- [understanding.test.ts](../tests/understanding.test.ts)

Separate suites: [test-render.mjs](../scripts/test-render.mjs), [validate.py](../spec/validate.py), [test.mjs](../scripts/test.mjs). No installed CI check or external independent review was returned at baseline.
