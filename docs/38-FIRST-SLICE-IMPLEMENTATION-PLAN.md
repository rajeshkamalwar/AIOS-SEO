# 38 — First Slice Implementation Plan

Status: ordered implementation contract. The subsequent 2026-09-17 user instruction authorizes sequential implementation through M5. Before each milestone, re-read its referenced specifications and ADRs; implement, fully test, report, commit and push that milestone to the existing implementation PR. Advance only after all acceptance criteria pass and no genuine specification, security, privacy, authority or architectural blocker remains. This supersedes the earlier M1-only stopping instruction; production activation and external website writes remain separately gated.

## M1 — Tenant-scoped evidence ledger and atomic delivery

Objective: establish real durable tenant isolation and immutable evidence history before collecting a website. Dependencies:25/26/33/34, ADR001/002/003/006, local-synthetic profile. No live identity provider, crawler, renderer, model, client UI or automatic skill release.

Expected files: root package.json/package-lock.json/tsconfig.json/.gitignore; packages/contracts validation; packages/persistence migrations and domain repository; packages/evidence local blob adapter; tests/foundation integration; scripts/test database harness; README run instructions. Use real PostgreSQL17; test fixture identities are provisioned by privileged test setup only, no public fake-login endpoint.

Implement typed Tenant/User/Membership/Site/Evidence/Observation/EvidenceBundle records, knowledge clock, minimal identity spine/reference tables, outbox/inbox and evidence acceptance commands. The first ledger may expose an internal library, not an HTTP API. Site registered from a validated pre-normalized synthetic fixture; production URL admission belongs M3. Domain service derives tenant from an injected verified principal, checks active membership/site scope, and applies transaction-local DB scope. Schema validity never grants authority.

Acceptance criteria (all required):

- M1.1 Clean migration on PostgreSQL17; second migration application makes no changes; runtime role non-owner/non-superuser/no BYPASSRLS with forced policies.
- M1.2 Two tenants same origin retain independent Site/Evidence IDs; foreign read and reference insertion denied, including direct SQL and pooled scope reuse. Missing scope returns no rows/denial. Viewer cannot accept evidence; revoked membership denied.
- M1.3 Store actual fixture bytes, verify digest/length, then accept Evidence+Observation+outbox atomically. Failure before commit leaves no accepted row/event. Unreferenced blobs stay inaccessible and are safely removable. ID-derived object paths cannot traverse directories or follow symlinks.
- M1.4 Retry same tenant+attempt+subject and identical input returns original result and one event; differing payload conflicts. Separate deliberate attempt produces new observation. Evidence/Observation payload mutation is denied; metadata deletion follows a separate command.
- M1.5 Frozen bundle references only same-site accepted inputs at or below known_seq; late evidence excluded from old cutoff. Concurrent clock/acceptance transactions cannot backdate membership in a frozen bundle. Different-tenant bundle IDs cannot resolve.
- M1.6 Outbox event validates schema, domain failure rolls it back; duplicate delivery creates one inbox receipt/local effect. A process restart retrieves previously committed evidence and pending outbox. No in-memory timer claims durable work.
- M1.7 Tests, typecheck and build pass; report exact results and runtime version. Local adapter/profile cannot activate external collection or provider calls. Secrets/data/build output ignored by Git.

Tests are adversarial integration tests for those seven criteria, plus schema rejection of authority widening and unknown→zero conversion. Postgres restart tests use a disposable cluster only. No future tables are required merely because their schema exists. Full job claiming/retry worker belongs M2; M1 proves durable delivery primitives without claiming it runs a Brain cycle.

## Remaining ordered milestones

| Milestone | Objective / dependencies | Expected modules and tests | Exit / excluded work |
| --- | --- | --- | --- |
| M2 Durable governed work | M1; leases, reservations, stop/deletion fences, release registry and audit | packages/jobs, policy, skills; process kill/duplicate/revocation/concurrent budget tests |33/35 critical runtime controls pass; no website collection yet |
| M3 Public perception | M2; HTTP, robots, sitemap, frontier, raw and isolated render | packages/perception, workers/render, fixture server;30 network/robots/XML/parser/sandbox corpus | Persist honest coverage/raw-render observations; no business inference or website writes |
| M4 Understanding and strategy | M3; Twin/assertions/graph, gateway, skills, capability assessments and opportunity selection | packages/twin, graph, models, strategy, evaluation; frozen model/skill tests and historical correction | Real field-level understanding/lineage, independent publication gate; no Auto or private connectors |
| M5 Returnable read-only product | M4; authenticated APIs, business projections and simple mobile web client | apps/api, apps/web, interpretation; E2E submit→reopen, auth/CSRF, accessibility and evidence drill-down | Entire36 path persists through crashes; max3 useful next steps, missing sources honest; no3D/expert dashboard default |

M5 is a working persistent read-only Brain, not a mock dashboard. Native mobile, deeper expert console, private search integrations, territory visibility, experiments, controlled website actuators and global learning each require later scoped authorization/contracts. Do not pretend M1 implements the full product.

M1 execution evidence: [implementation report](../reports/M1-IMPLEMENTATION.md). M2–M5 authorization is conditional as stated above.

M2 governance review: [implementation report](../reports/M2-IMPLEMENTATION.md) and [accepted ADR-007](decisions/007-audit-effect-scope.md).

M2 execution evidence: [implementation report](../reports/M2-IMPLEMENTATION.md). ADR-007 is accepted and the M2 acceptance suite passes. M3 is the next milestone; no website collection or write capability has been activated.
