# ADR-025: governed submitted-seed admission

Status: Accepted reversible local engineering default.
Date: 2026-09-19.

[ADR-024](024-governed-local-robots-completion.md) completes robots interpretation but grants no new collection authority. Add independent admission of the already submitted seed under [26](../26-TEMPORAL-EVIDENCE-CONTRACT.md), [30](../30-CRAWL-RENDER-CONTRACT.md), [33](../33-EVENT-JOB-CONTRACT.md), [34](../34-SECURITY-TENANCY-DATA.md) and [35](../35-QUALITY-SELF-AUDIT-GATES.md). A sitemap is neither fabricated nor required to classify this existing target.

The operation takes the original completed bootstrap lease, verifies original attempt/token and the immutable completed projection/acceptance/witness chain, and derives the exact same-run submitted CrawlTarget and source IDs from persistence. Reuse the existing exact artifact verification and MIME/error-conservative robots adapter. Caller-supplied URLs, robots decisions, observations, target IDs and bundle member lists are not accepted.

Known rules plus pageAllowed admit the exact seed, represented canonically by admitted=true/state=queued. Known disallow or denied robots exclude it; unknown robots defer it. Admission capacity remains bounded by the canonical500-target limit; exhausted capacity defers. An unrelated prior frontier classification conflicts rather than resetting its history. This operation makes no request and installs no successor fetch job.

The original frozen bootstrap input bundle predates robots outputs and remains immutable. A narrow scheduler-only definer freezes a new bundle from the exact accepted scope and robots Evidence/Observation members at the current tenant cutoff. The same transaction updates seed classification, writes an immutable seed-admission receipt and emits frontier.seed_classified. This avoids duplicate intermediate bundles on retry and does not grant general scheduler bundle-writing rights. Current original-submitter membership/site authorization, source release, audit, deletion and freshness gates remain mandatory.

Artifact reads and deterministic parsing occur outside work/knowledge-clock locks. Recheck current source and target identity before the atomic transaction. Replay returns the original bundle/disposition with no extra event, clock increment or target rewrite, after verifying current source and retained bundle integrity/eligibility. The returned immutable receipt describes the recorded admission decision, not a promise that the target is still queued: later legitimate target processing may advance its operational state, and replay must not reset it. Any future dispatcher must separately check current target eligibility. Bundle freezing is bookkeeping, not collection permission. Event payloads contain IDs and disposition only, never body/URL data or invented sitemap evidence.

The trusted scheduler adapter enforces complete source/artifact/audit/deletion validation and robots matching. SQL authenticates scoped persisted associations, bounds outcomes and capacity, and atomically commits the narrow transition. No worker or client receives scheduler credentials. Real-world activation, public egress, controlled site changes and further page collection remain separate dependencies.

Seed admission and existing sitemap/link expansion share one pinned robots observation per run. Every entry point checks all established frontier contexts, including the new seed receipt; a different observation conflicts rather than silently switching policy. This also applies to restricted SQL helper calls.
