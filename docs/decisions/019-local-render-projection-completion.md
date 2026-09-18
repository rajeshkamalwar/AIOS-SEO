# ADR-019: local typed render projection and completion

Status: Accepted reversible local engineering default.
Date: 2026-09-18.

[ADR-018](018-local-render-evidence-retention.md) accepts a privacy-limited collection, leaving typed projection separate. Implement the next bounded part of [30](../30-CRAWL-RENDER-CONTRACT.md) and [33](../33-EVENT-JOB-CONTRACT.md): a scheduler handler projects only an authenticated accepted local collection and completes its job atomically. It cannot collect or accept arbitrary artifacts.

Read the exact accepted manifest and every referenced transformed DOM through scoped Evidence metadata, verify their hashes and associations, and check the closed retained-manifest contract. No parsing, network or blob reads under the work/knowledge-clock lock. Recheck current lease, release/tool permission, membership, source scope/audit/freshness and independent deletion after artifact I/O. Source preparation and physical execution are not repeated.

Each retained sample becomes a RenderSnapshot with its actual measured observation instant and pending-request count, nominal requested sample offset, exact accepted DOM Evidence ID, browser build and bound context. Its state is `policy_limited`, because privacy and network restrictions preclude complete-render claims. `critical_text_hash` stays null until a separately governed extractor establishes critical text; a whole-DOM digest must not impersonate that measurement. Each independently observed sample is its own immutable series/version1, without invented supersession of a different observation. Failure before DOM yields no RenderSnapshot.

Denied resource URLs were withheld during collection. Do not invent ResourceObservation URLs or claim zero resource activity; the retained manifest still contains bounded attempt counts, types and measured times. A future privacy-aware resource record contract is separate. Do not infer absent resources, complete DOM parity or website defects from suppressed content.

The projection transaction inserts snapshots, an immutable projection mapping, `render.completed` and `job.completed` outbox events, then completes the exact job/attempt and clears its lease. Job `result_ref` is the accepted Observation, including when it has no DOM. The handler has completed; that does not mean the website rendered successfully. `render.completed.result` is partial when samples exist and failed when none exist. Detailed worker outcome stays in the manifest.

Both events use the accepted Observation aggregate: its existing `evidence.recorded` is version1, followed by render completion version2 and job completion version3, at the same projection knowledge sequence. The operational job ID is not invented as a domain aggregate. Any event failure rolls back snapshots, mapping and completion together.

Generic render completion remains forbidden. The SQL transition guard permits only a completion linked to the projection mapping created in the same transaction. Exact completed replay proves the original attempt/token through immutable reservation/mapping, checks current run/scope/release/source/audit/deletion gates and returns the existing result without writes or re-execution. Cleared lease fields do not authorize a new projection, and expired old attempts cannot publish late results. Historical reading is a separate API responsibility.

This is synthetic local projection only. It does not resolve [raw fixture retention](../../vault/gaps/GAP-039.md), public egress, customer deployment, unattended recovery, parity diagnosis or complete SEO capability delivery. No website-write authority.

The trusted service enforces the full affected-output audit graph and independent deletion ledger. SQL protects the accepted manifest association, current stored admission context and atomic transition; it does not independently read the external deletion ledger or duplicate the full service audit evaluator. No browser, model or customer receives scheduler credentials.
