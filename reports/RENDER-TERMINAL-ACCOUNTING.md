# Render terminal accounting protocol

Baseline: parent9620e9a. GAP-036 implements the bounded accounting prerequisite of GAP-008 under [ADR-016](../docs/decisions/016-render-terminal-accounting.md).

The bounded protocol is implemented and verified with independent supervisor fixtures. The prepared-input digest is an immutable assertion at this protocol boundary, not independently authenticated bytes. No actual container termination producer, renderer dispatch, public-network grant or Evidence acceptance is claimed.

## Implemented boundary

A render reservation pins the exact project lease, persisted snapshot, frozen bundle, offline profile and asserted input digest. The trusted adapter reuses existing lease and current source/audit/deletion checks. The database independently enforces local policy, exact scope/attempt/source identity, current run/release, budgets and concurrency. No accounting row is a dispatch capability.

Each navigation atomically charges one page and100 requests in immutable generic budget rows and reserves10MiB in the render ledger. Generic reservations also count toward run/tenant caps. The lane allows one unsettled reservation per run and two globally, never more than20 navigations or200MiB per run. Confirmed low or unknown usage does not refund the worst-case charges.

The separate render-supervisor role binds actual-container identity and image/context before execution, then records an immutable terminal transcript. Scheduler, runtime, HTTP supervisor and browser identities cannot manufacture that transcript. Settlement references its ID, releases capacity once, and can complete after cancellation/revocation without authorizing results. Exact binding replay still requires a live lease; stale planned work cannot become a new grant.

Shared lease checks were extracted without changing existing Jobs semantics. This avoids a second copy drifting from current membership, deletion, run, health and release rules. The full existing test suite remains part of verification.


## Verification — 2026-09-18

- `npm test`: **431 passed** (425 main including nested SQL cases, plus6 API-scope cases), zero failures/skips. Vault precheck:10 guards passed.
- `npm run typecheck` and `npm run build`: passed.
- `node scripts/test.mjs --compiled-render-lane`: **26 passed** (14 foundation,12 render protocol), exercising compiled JavaScript against disposable PostgreSQL.
- Compiled API, isolated DOM, render result/input/manifest and understanding suites: **45 passed**. Combined compiled executions:71 tests.
- Specification validation and both production dependency audits passed; zero audit vulnerabilities.
- No Docker execution in this accounting checkpoint. Previous browser proof remains in the source-preparation report.

The12 new cases cover exact reservation/context replay, cross-tenant/run isolation, one-run/two-global capacity,20 permanent navigation reservations reaching2000 requests/200MiB even with zero measured consumption, generic budget consumption, explicit local-only policy, source audit rejection, health/membership/deletion/lease gates, independent supervisor and direct-SQL forgery denial, both immutable backing charges, cancellation/revocation followed by accounting-only settlement, and an actual PostgreSQL immediate restart preserving unknown occupied capacity. Unknown request and byte counters remain null; replay never decrements capacity twice.

Review moved the current lease check ahead of binding replay, so a stale binding cannot receive a success response. The initial wrong-policy test expected one specific error, while the earlier membership/scope gate correctly rejected it; the test now accepts either documented safe rejection. No authority was weakened to make tests pass.

GAP-036 closes only this local protocol. GAP-008 still requires a render-specific immutable job input and explicit governed tool permission, actual fixed-container supervisor/termination proof and atomic artifact acceptance. Test-authored container IDs and terminal witnesses are not actual Docker execution or real-world capability evidence.
