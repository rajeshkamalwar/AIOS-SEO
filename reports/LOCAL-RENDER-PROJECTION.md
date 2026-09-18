# Local render projection and completion

Baseline: parent8a86864. Verification passed:487 application tests (481 main +6 scoped API),85 compiled tests (24 foundation/projection +61 API/parser/privacy/retention/understanding), typecheck, build and both production dependency audits (zero vulnerabilities). [ADR-019](../docs/decisions/019-local-render-projection-completion.md) defines the bounded GAP-040 handler within GAP-008.

Project already accepted privacy-limited local artifacts into truthful typed snapshots, then atomically complete the job and outbox records. No ResourceObservation URL reconstruction, raw ingestion, external collection or SEO parity conclusion is authorized.


The opt-in Docker suite passed25 cases:24 overlap protocol tests and one executes the actual persisted fixture→isolated Chromium→private transformed Evidence→typed snapshots→atomic completed-job path. No skips. Image SHA-256 `4a4290232b4c2b068ccec9b781fa9da4902fb3c096d34ca82d23a727b471f08e`, Chromium `153.0.8010.12`, dedicated context `colima-aios-seo`. Container absence is independently confirmed. These are synthetic local observations, not real-world SEO validation.

Typed records retain each measured sample instant, pending-request count and nominal sample slot, exact privacy-limited DOM evidence and source provenance. Independent immutable sample series do not invent supersession. Critical-text hashes remain null. No ResourceObservation row is fabricated for withheld URLs. Zero-DOM failures produce no snapshot; the processed job points to its accepted Observation, with explicit failed render result.

Tests verify temporal cutoffs and domain/event schemas, exact original attempt/token proof, completed replay without new clock/events or re-execution, current revocation/deletion/audit/source scope, artifact mutation/unavailability, direct SQL table/completion bypass, forged manifest measurements, cancellation during unlocked private reads, both-event rollback and PostgreSQL restart. Full service policy checks bracket blob I/O; SQL protects exact accepted associations and atomic state transition. The SQL function does not independently read the external deletion ledger or replace the service audit evaluator.

Initial focused testing exposed only a denied cross-scope request's error-name mismatch, aligned to lease_lost. The first opt-in run exposed a synthetic timing defect: one setTimeout could wake before the requested sample offset. The actual Docker case passed even in that run. The fixture now waits against measured time without clamping/inventing offsets, matching the existing production worker's measured wait loop; full source, compiled and opt-in verification passed after correction.

GAP-040 closes only this projection/completion boundary. GAP-008 broader resource/invocation orchestration, GAP-039 upstream raw fixture retention and deployment/live egress remain open. No full capability completion, customer processing, website-write authority, parity diagnosis or production proof is claimed.

Specification validation passed23 schemas,1056 references,37 positive and10 negative examples,10 draft skill manifests and158 document links. Ten vault guards, checkpoint history/view checks and diff checks passed.
