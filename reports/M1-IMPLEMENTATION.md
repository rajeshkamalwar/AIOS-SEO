# M1 implementation report

Date: 2026-09-17. Specification baseline: `0f3fdf919967197a1c0467d6c4b9c755b8c43ed5` on `docs/architecture-readiness-review` (PR1), documents00–39 and ADR001–006. Implementation branch: `codex/m1-evidence-ledger`.

## Implemented

Internal TypeScript library for the local synthetic profile: tenant/site authorization, typed PostgreSQL evidence/observation/bundle storage, immutable payloads and reference sets, commit-ordered knowledge cutoffs, private filesystem artifacts, atomic domain/outbox acceptance, idempotent inbox delivery and a small persisted evidence projection. Fixture provisioning is privileged test setup; there is no fake-login/public API endpoint.

The SQL migration creates Tenant/User/Membership/Site/Evidence/Observation/EvidenceBundle plus supporting identity/clock/reference/delivery tables. Site.business_id remains null until the Twin milestone. Evidence capture accepts only reserved .example sources in local mode; no HTTP client, model provider, renderer or client UI exists in M1.

## Actual verification

Environment: Node24.19.0, PostgreSQL17.11, macOS. A private disposable Unix-socket cluster was created, crashed/restarted and removed by the harness; existing database services were not restarted or relinked. PostgreSQL17 was installed alongside the existing version for these tests.

| Check | Actual result |
| --- | --- |
| `npm test` |51 tests passed;0 failed/skipped, including14 PostgreSQL integration tests |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; schemas and migration included in compiled output |
| Compiled contract module import/hash smoke check | Passed |
| `npm audit --omit=dev` |0 vulnerabilities reported |
| Python specification validator |18 schemas,952 references,31 positive and4 negative examples,48 catalog records,13 artifact hashes,6 source excerpt hashes,9 skill manifests; passed |

Coverage maps to all seven M1 criteria in document38. Tests exercise foreign tenant/site references, RLS and pool reuse, viewer/revoked/scoped roles, phantom identities and membership widening, actual bytes/hash/tampering, rollback before outbox commit, idempotency conflicts, immutable bundle references, concurrent knowledge cutoffs, duplicate consumer delivery, consumer rollback and database process recovery.

Failures found and fixed: source-class column incorrectly mapped to JSON; trigger search_path depended on a previous connection; restart harness inherited a log pipe; runtime could add membership references or insert phantom index identities; frozen reference sets required their own transaction-bound immutability guard. These failures were not waived.

## Specifications satisfied and limits

M1 implements the scoped subset of25/26/33/34 and ADR001/002/003/006 defined in38. Shape validation is separate from semantic/permission validation. The model, crawler, skill release, graph and full product acceptance suites remain unrun. All SEO skill examples remain draft/stale and cannot be promoted from these results.

This is not a production deployment: no real identity provider, deletion scheduler/backup restore workflow, durable job lease scheduler, cloud blob adapter, public collection, model reasoning, Twin or business client. Owner and expert roles can read raw fixture artifacts; editor/viewer cannot. Production runtime rejects this fixture identity/profile path. The DB service account is trusted to set validated scope; RLS protects omitted predicates, not a compromised server with those credentials. Filesystem root is private to the local adapter; it is not a hostile shared-filesystem sandbox.

Rollback for this local milestone is removal of the disposable test cluster and ignored build output. No destructive rollback is run against an existing database. Future migrations must preserve evidence history; do not edit migration001 after release.

## Next milestone

M2 — durable governed work: job leases/fencing, budget reservations, cancellation/deletion fences, release registry and independent audit. It is specified but **not started or automatically authorized**. Stop at the M1 boundary.
