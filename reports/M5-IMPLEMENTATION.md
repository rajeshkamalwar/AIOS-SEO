# M5 implementation report

Date: 2026-09-17. M4 baseline: `9664017`.
Status: **Implemented and tested in the local synthetic profile.**

M5 adds an authenticated, CSRF-protected read-only API contract for submit, run reopen, understanding, graph and cancellation, plus a simple mobile-first business-language client shell. The API validates local schemas, returns private no-store responses, exposes no tenant identifier from the request body, and preserves explicit missing-source states for Search Console, analytics, Bing, SERP, rankings and AI answers. A PostgreSQL-backed adapter and publication tables now survive process boundaries; publication writes remain evaluator/domain-owned, not client-controlled. The client contains no fake metrics, approval controls or action actuator.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 161 passed; 0 failed/skipped |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Specification validator | Passed: 19 schemas, 989 references, 48 catalog records, 106 document links |
| `npm audit --omit=dev` | 0 vulnerabilities reported |

Tests cover the composed URL/perception/evidence/understanding/graph/publication/API path, authenticated submit and reopen, durable PostgreSQL run/publication reads, CSRF enforcement, explicit unknown source projections, graph response validation, M1–M4 persistence/governance/perception/understanding suites and audit transitions.

## Limits

The local profile uses an injected verified principal and a synthetic publication writer in the integration harness. Production OIDC, HTTP deployment, restart-after-publication process testing, real crawler/render worker activation, model/provider policy and full Twin/assessment authoring remain deployment-gated. Website writes, private connectors, rankings, revenue and causal outcomes remain out of scope.
