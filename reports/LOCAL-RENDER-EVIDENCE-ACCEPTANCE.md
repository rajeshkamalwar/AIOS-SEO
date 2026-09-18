# Local render evidence acceptance

Baseline: parentd04ebff. Verification passed:477 application tests (471 main +6 scoped API),88 compiled tests (27 foundation/acceptance +61 API/parser/privacy/retention/understanding), typecheck, build and both production dependency audits (zero vulnerabilities). Scope: privacy-limited local fixture retention and authenticated Evidence/Observation acceptance within GAP-008, under [ADR-018](../docs/decisions/018-local-render-evidence-retention.md).

No RenderSnapshot/ResourceObservation projection, job completion, live processing or production proof is claimed. Unredacted worker output remains transient. All capability maturity remains unchanged until scoped verification is recorded.

Upstream raw HTTP fixture retention is separately tracked by [GAP-039](../vault/gaps/GAP-039.md); this checkpoint cannot close that privacy gap.


The opt-in actual Docker acceptance suite passed28 cases:27 overlap the protocol suite and one executes retained fixture source through real isolated Chromium into transformed private Evidence/Observation. The container is independently confirmed removed. No skips. Image SHA-256 `4a4290232b4c2b068ccec9b781fa9da4902fb3c096d34ca82d23a727b471f08e`, Chromium `153.0.8010.12`, dedicated `colima-aios-seo` context. Form, detached-control, script and URL sentinel values are absent from newly retained artifacts. The source fixture itself remains subject to separately open GAP-039.

Distinct acceptor credentials cannot dispatch, reserve, bind, attest or settle render work; scheduler/runtime/operator/supervisor cannot call the acceptance function. Current source/audit/deletion/release/lease checks apply even after terminal settlement and after blob upload. Exact/concurrent replay returns the same identities; PostgreSQL crash/restart preserves accepted mappings and artifact integrity. A shared maintenance fence protects staged private blobs from orphan sweep before commit. Failed outbox writes roll back all accepted metadata. Failed acceptance uploads may remain private unreferenced objects, never evidence.

The SQL collection boundary authenticates stored invocation/terminal context and closed artifact metadata; trusted collection code verifies and transforms actual bytes. SQL does not independently execute the privacy parser or establish arbitrary blob truth. Successful collection remains a partial Observation because filtering removes material. Freshness is capped by source dependencies. Zero-sample conforming failures retain a failure receipt/Observation without invented DOM. Nonconforming worker output receives no collection acceptance.

Regression work corrected typed provenance links (PageSnapshot remains the Observation subject and manifest source, not an unsupported generic provenance link), canonical UTC event timestamps, role separation, maintenance synchronization and URL-identity ambiguity after removing base/query data. Initial test failures were fixed before final verification. The isolated privacy parser passed11 source/compiled cases; retained-manifest checks passed5, included in totals. No arbitrary-secret detection, complete DOM parity or production isolation claim.

Specification validation passed23 schemas,1056 references,37 positive and10 negative examples,10 draft skill manifests and153 document links. Ten vault guards, source-history checks and diff checks passed. This closes GAP-038 only. GAP-008 typed RenderSnapshot/ResourceObservation projections and canonical job completion, GAP-039 upstream raw privacy, and live deployment gates remain open.
