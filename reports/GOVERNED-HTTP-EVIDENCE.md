# Governed local HTTP evidence acceptance

Baseline:aa8e9f7. [ADR-023](../docs/decisions/023-governed-local-http-evidence.md) defines the scoped local prerequisite.

Implementation and scoped verification passed on2026-09-19. No public observations, customer data, job completion or website-write authority.

Review and failure history: added witnessed worker conformance so malformed worker output cannot be accepted merely because broker bytes exist; null-body transport failure remains a distinct bounded receipt. First integrated SQL run exposed an ambiguous receipt_id reference in the acceptance function. Correction and rerun required before checkpoint acceptance. Typecheck caught private transcript nullability and canonical-string hashing mismatches during integration; those were corrected.

Verification:568 application tests passed (562 primary plus6 API scope), with10 separate vault guards. Focused source30/30 and compiled30/30 passed;80 additional compiled tests passed (110 compiled total). Actual Docker acceptance suite31/31 passed:30 overlapping cases and1 actual network-none container→broker→retained Evidence path. Typecheck/build passed. Specification validation:25 schemas,1067 references,39 positive/12 negative examples,11 Skill manifests,178 document links. Both production dependency audits:0 vulnerabilities.

Logs: /tmp/aios-http-evidence-full.log, /tmp/aios-http-acceptance-test.log, /tmp/aios-http-acceptance-compiled.log, /tmp/aios-http-evidence-compiled-other.log, /tmp/aios-http-acceptance-docker.log. PostgreSQL17/Node24; Docker context colima-aios-seo, unchanged immutable HTTP image06921e104ac0b535a56095cde72971d1844e5420e5010cb9ff25367851f0297c. This is local TESTED evidence, never real-world or production proof.

Tests cover exact reviewed bytes/private retrieval, terminal/body/header/context tamper, current release/cancellation/deletion/audit/lease checks before and during upload, maintenance fencing without work locks, independent-role denials, zero uploads for unreviewed data, atomic outbox rollback, immutable replay/concurrent deduplication and real database restart. Protocol violation, invalid worker conformance and uncertain cleanup cannot reach acceptance. HTTP404 remains an observed response; closed transport failure retains no invented body. No PageSnapshot or job completion is created.

Independent review confirmed scoped acceptance boundaries after corrections. Full current audit-graph and external deletion-ledger checks live in the trusted acceptor service, supplemented by restricted SQL enforcement. Reusing the older Ledger fixture API alone would not provide original job/invocation authority; this path does not do so.
