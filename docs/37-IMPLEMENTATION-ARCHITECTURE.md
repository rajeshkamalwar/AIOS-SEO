# 37 — Implementation Architecture

Status: engineering decisions accepted for the first slice under the user's instruction to resolve reversible defaults. ADRs001–006 record alternatives. Acceptance authorizes implementing contracts, not claiming tested production behavior.

## Concrete stack and module boundaries

| Choice | Workload reason and limit |
| --- | --- |
| TypeScript strict, Node24 LTS | I/O-heavy tools and shared JSON contracts; one language for first slice. No domain dependence on any model SDK |
| npm workspaces, lockfile | Small modular repository with standard reproducible install; no build orchestrator needed. Supersedes earlier uncommitted pnpm consideration |
| Fastify5 HTTP/JSON | Async operation IDs and schema validation for mobile/web; custom Ajv2020 integration, no default coercion/removal |
| PostgreSQL17, pg driver, versioned SQL migrations | Transactions, composite scope FKs, RLS, temporal revisions and outbox; explicit SQL exposes security semantics; no ORM hiding them |
| Private S3-compatible blob interface; local filesystem adapter for synthetic tests | Large immutable HTML/DOM; rows retain digests. No public object keys; production region/lifecycle gated |
| SQL job/outbox/inbox | Bounded twenty-minute read runs and modest fan-out; SKIP LOCKED claims, leases and atomic records; no Kafka/Temporal operational requirement yet |
| Relational graph, bounded queries | Radius2,200 nodes,400 edges; graph projection rebuildable from assertions. No vector or graph database without measured need |
| Node HTTP client + parse5 + bounded XML parser | Deterministic URL/headers/HTML/XML work, streamed byte budgets and manual redirects. Exact package patch pins set at respective implementation milestone |
| Playwright Chromium, isolated Linux sandbox and egress proxy | Hostile JS requires separate resource/security boundary. Pin matching browser/build and container digest at M3; evaluate gVisor with sandbox escape/egress tests |
| Provider-neutral gateway | Task quality/privacy/cost drive routing; no mandatory vendor or agent platform |
| OpenTelemetry-compatible instrumentation | Async correlation and typed counters; domain audit persists separately from telemetry |
| Business REST projections | Future native mobile/web/expert clients share domain meaning. No client framework/scaffold required at M1; 3D later |

Architecture is a modular control plane plus separately isolated HTTP/render/model workers. Core modules: access/assets, evidence/temporal, Twin/graph, strategy/opportunity, skills/missions, policy, evaluation, interpretation. Modules own writes; public APIs expose commands and projections, not generic table mutation. Strategies retain why/what, agents bounded how.

Sources checked2026-09-17: [Node release lifecycle](https://nodejs.org/en/about/previous-releases), [PostgreSQL locking](https://www.postgresql.org/docs/17/sql-select.html), [Ajv2020 validation](https://ajv.js.org/json-schema.html), [Playwright deployment](https://playwright.dev/docs/docker). These support runtime support, queue locking, schema dialect and browser sandbox cautions; they do not prove this product's performance.

## API serialization

19 routes remain canonical. Submit accepts api.schema Submit; no caller tenant ID. 202 returns Accepted; duplicate same key returns same run ID and current Run state if already advanced (200), different body409. Invalid JSON/schema400, missing session401, role denial403, nonexistent/foreign resource404, conflict409, forbidden URL422, tenant admission429, unavailable policy/storage503. Error uses api.schema Error and common classified code; do not expose foreign existence. Cancellation is idempotent202 with Run; no new network dispatch after cancellation is observed. Understanding missing publication returns503 projection_pending with Retry-After. Completed queries200; graph cursor mismatch409.

GET graph validates radius/time/cursor budgets from27. Unknown query parameters400. Command body≤16KiB, general result≤2MiB, request ID per response. Private no-store cache policy. Business cards' tenant/site context is inherited from authenticated route; every assessment/evidence reference still checked. model/result IDs resolve tenant-scoped gateway ledger.

## Capacity and recovery objectives

Development target100 tenants/200 sites,10 simultaneous runs,100000 stored page identities and1million assertions. API p95≤500ms for indexed reads excluding network work; graph p95≤1s at declared bounds; validate on documented4vCPU/8GiB DB and2vCPU API test environment. These are acceptance targets, not measurements or customer SLO promises.

Proposed pilot availability99.5% monthly, RPO≤15min, RTO≤4h, PostgreSQL PITR and35-day encrypted backups, evidence lifecycle/version tracking. Actual hosting/region and operator are launch gates. Restore drills must reconcile deletion ledger, database/objects, outbox and lease state before resuming. Alert on outbox>60s, dead letters, publication errors, budget overshoot and isolation incidents. No database fallback to transient memory.

Revisit Temporal when human waits and multi-day actuator workflows justify history/versioning overhead. Revisit graph store after measured traversal failure. Revisit separate services after independent scaling/security requirements; preserve IDs/contracts and rebuild projections instead of dual authoritative stores.
