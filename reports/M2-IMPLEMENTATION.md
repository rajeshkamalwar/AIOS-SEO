# M2 implementation report

Date: 2026-09-17.
Baseline: `cca89edfa13b5875bc5b3f5b8007ecca87b5fd01` on `codex/m1-evidence-ledger`, implementation PR #2, stacked on specification PR #1.
Status: **Implemented and accepted after ADR-007 resolution.**

## Authorization and scope

The current user instruction authorizes sequential work through M5, conditional on each milestone passing all acceptance criteria and no genuine blocker. It supersedes the historical M1-only stopping instruction.

M2 remains durable governed work: leases, reservations, cancellation/deletion fences, release registry and audit. No website collection belongs in this milestone.

## Referenced contracts reviewed

Re-read AGENTS.md, README, document 38, documents 21/25/26/28/32/33/34/35/37/39 and ADRs 001–008. Cross-checked the job, mission, quality, audit and domain schemas, transition fixtures, source governance and security rules before implementation.

## Resolved governance decision

The product owner accepted ADR-007. Documents 21 and 35, `quality-gates.json` 1.1.0, `audit.schema.json`/`SelfAuditResult` v2 and `audit-transitions.json` now agree: A02/A07/A08/A11 use `reject_outputs` for direct outputs plus their complete transitive dependent closure; independent outputs continue only after their own gates pass; incomplete scope becomes `quarantine_run`; integrity failures quarantine the run; revocation blocks dependent admission, dispatch and acceptance; recovery is independently governed and never agent-cleared.

## Actual verification

| Check | Actual result |
| --- | --- |
| `npm test` | 148 tests passed; 0 failed/skipped, including M1 and M2 PostgreSQL integration tests plus audit transition fixtures |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Offline specification validator | Passed: 19 schemas, 985 references, 48 catalog records, 104 document links |
| `npm audit --omit=dev` | 0 vulnerabilities reported |

Tests cover idempotent run/job admission, role separation, concurrent claims, lease fencing and expiry, bounded retry/dead-letter, atomic reservation limits and duplicate settlement, cancellation, deletion tombstones across stale database epochs, signed distinct-author/reviewer release approval, dependency revocation at admission/dispatch/acceptance, transitive output suppression, incomplete-scope quarantine, and immutable recovery requirements.

## M2 implementation

The durable work package adds SQL-backed crawl/run state, bounded jobs and attempts, 30-second leases with fenced heartbeats, retry/dead-letter transitions, integer budget reservations and settlement receipts, cancellation and deletion epochs, signed versioned skill releases with transitive freshness/revocation checks, independent evaluator audit scope/impact records, and an independently retained deletion ledger. The local registry installs only the deterministic reliability handler; no network, model, website-write or external connector capability is activated.

## Next action

This is the local synthetic profile. Production identity, provider policy, backup/recovery drills, real skill release operations and external collection remain gated by document 34. M3 — public perception — is next; it must re-read documents 29/30/33/34/37 and ADR-004 before implementation. M3 remains read-only.
