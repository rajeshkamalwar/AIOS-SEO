# Governed local offline-render execution

Baseline: parentf9543a8. Bounded GAP-037 within GAP-008 under [ADR-017](../docs/decisions/017-governed-local-render-execution.md). Verification: 446 application cases (440 main + 6 scoped API), 72 compiled cases (27 foundation/render-execution + 45 API/parser/understanding), and 10 vault guards passed. Typecheck and build passed. Both production dependency audits report zero vulnerabilities.

The separately authorized render child pins actual retained source and prepared input. It requires a fixed local procedure and a cumulative one-call rendering permission; a generic project lease cannot launch Docker. The actual producer creates a paused fixed container, binds its immutable identity, rechecks current permission/source after final inspection, then starts it. Cleanup must independently confirm stopped state and removal before terminal accounting.

No Evidence/RenderSnapshot acceptance, completed render job, unattended dispatcher, production image approval or public-site observation is claimed. The operational receipt has `evidenceAccepted:false`; worker conformance and physical execution are not accepted SEO results.


The opt-in PostgreSQL/Docker suite passed 28 cases: 27 overlap the normal protocol suite and one executes actual persisted fixture input through the governed child, isolated Chromium, confirmed container removal and terminal accounting. No skips. Image SHA-256: `4a4290232b4c2b068ccec9b781fa9da4902fb3c096d34ca82d23a727b471f08e`; browser build `153.0.8010.12`; dedicated context `colima-aios-seo`. Existing worker browser scenarios are historical evidence, not claimed rerun here.

Regression coverage includes immutable descriptor enforcement, exact tool permission/version, cumulative one-call limit across retries, generic project rejection before engine creation, current revocation/cancellation/deletion/audit checks, source changes and stale robots at the final metadata gate, malformed worker output and uncertain cleanup retaining capacity. The final permission check runs after container inspection and immediately before start. Independent cleanup, not CLI close or worker output, supplies the terminal witness. Metadata-only final checks perform no artifact I/O.

The initial specification validation caught scenario references missing from the draft fixture manifest's scenario catalog. This is corrected before checkpoint acceptance; validation results are recorded below. No capability is promoted beyond its local prerequisite maturity. GAP-008 remains open for governed artifact acceptance and atomic completion. A process crash with uncertain container identity conservatively holds capacity; automated recovery is not implemented.

Specification validation passed:22 schemas,1037 references,36 positive and9 negative examples,10 draft skill manifests and145 document links. Vault history/update guards and diff checks passed.
