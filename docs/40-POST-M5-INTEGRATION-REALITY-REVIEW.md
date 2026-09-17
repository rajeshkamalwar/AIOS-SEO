# 40 — Post-M5 integration and reality-readiness review

Date: 2026-09-17. Review baseline: `3cacf74` (M1–M5 local slice).
Status: local read-only integration verified; production activation **not ready**.

## Verification performed

The complete composed local path now runs in one test process:

`authenticated principal → URL admission → durable PostgreSQL crawl/run → fixture robots and sitemap parsing → evidence-backed fixture claim extraction → bounded graph projection → PostgreSQL publication → authenticated API reopen → business-language projection`.

The composed test also checks explicit missing sources, CSRF enforcement, tenant-scoped reads, schema validation and fail-closed renderer/egress behavior. The final suite reports **161 passed, 0 failed/skipped**. Typecheck, build, offline specification validation and `npm audit --omit=dev` also pass. The disposable PostgreSQL harness uses Unix sockets, PostgreSQL 17 and removes its temporary cluster after each run.

This is an integration trace over local fixtures and a synthetic verified principal. It proves module composition and persistence semantics; it does not prove production network, identity, browser sandbox, model quality, compliance, availability or SEO truth.

## Reality matrix

| Area | Genuine operational behavior | Still synthetic or gated |
| --- | --- | --- |
| Tenant ledger, RLS, evidence, temporal cutoffs | PostgreSQL 17 transactions, forced RLS, immutable rows, blob digest/length checks, crash/restart tests | Local fixture identities and filesystem blob adapter |
| Durable work | SQL jobs, attempts, leases, fencing, budget reservations, release generations, revocation and deletion tombstones | Local operator keys, no deployed scheduler/alarms/backup drills |
| Perception | Deterministic URL policy, robots/sitemap parser, frontier bounds, XML entity rejection and egress checks | No live HTTP collector, DNS pinning proxy, durable CrawlTarget/PageSnapshot pipeline, or isolated browser worker |
| Understanding | Literal evidence-backed extraction, bounded graph projection, deterministic opportunity ordering | No released model adapter, frozen held-out quality corpus, full Twin revision authoring or production evaluator |
| API/client | Schema-validated authenticated boundary, CSRF check, durable run/publication readback, mobile-first static client | Injected auth adapter, no deployed HTTP service, no production publication writer |
| Search/platform truth | Unknown/not-connected states are preserved | No Search Console, Bing, analytics, SERP, ranking or AI-answer evidence |
| Governance | ADR-007 suppression/quarantine semantics and transition fixtures | Production reviewer/operator identities, incident/recovery operations and deployment policy |

## Review findings

The integration review corrected an IPv6 egress classification defect where `::` could be accepted as public. The regression test now rejects unspecified/private destinations. No other code changes were made to expand product scope.

The largest reality gap is the perception boundary: M3 currently proves safe deterministic admission/parsing but intentionally does not claim live collection or JavaScript rendering. The second is production identity and deployment policy. These are explicit architecture gates from documents 30, 34, 37 and ADR-004, not reasons to weaken the local profile.

No website-write capability, external connector, model provider or customer notification channel is present. The local client cannot approve or execute an action.

## Readiness decision

Ready for a controlled engineering next phase in a separately approved deployment profile. Not ready for customer URLs, external model calls, live crawling, production rendering or public launch. Those require the gates in document 41.
