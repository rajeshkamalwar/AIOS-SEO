# Persisted-source offline render preparation

Baseline: parent359a01d. Verified bounded GAP-035 within GAP-008. Resolve retained source provenance and reuse deterministic preparation; no render dispatch, Evidence acceptance or public-network authority.

Full GAP-008 remains open for render admission, durable accounting, independent container invocation and atomic artifact acceptance. Source fixtures and offline Chromium cannot establish real-world SEO capability maturity.

## Implementation boundary

`Jobs.prepareOfflineRenderFixture` reuses the existing project lease gates. Its internal helper derives source identifiers from persisted records, never caller-provided artifact metadata. The same-run snapshot, active page, admitted target, site-scope receipt and unique run robots context must agree with the frozen bundle and current input restrictions.

The first transaction resolves records and checks scope, time, release, lease and audit restrictions. Bounded private artifact reads and deterministic decoding happen outside database transactions. A second transaction repeats current checks, rejects a changed source fingerprint and validates retained scope/robots semantics using already-read bytes. Returning prepared bytes does not complete the job, reserve render capacity, dispatch Chromium or accept rendered evidence.

The retained full Content-Type supplies charset decoding. Raw digest and UTF-8 replay digest remain distinct. Partial, unsupported or incomplete source outcomes stay explicit; missing inputs and integrity failures cannot become fabricated HTML. The test-only Docker path consumes the bridge result under the existing network-none, nonroot sandbox profile.

## Review corrections and scope

Initial review found that checking only the admitted target missed rejection of an actual admission ancestor. A generic traversal of every bundle member overcorrected this and would block unrelated independently supported output, contrary to ADR-007. The bridge follows typed snapshot/target/observation/evidence dependencies, including parent targets, link-source snapshots and sitemap-index parents. Bundle containers and page identities are checked without treating all their unrelated contents or historical identity provenance as dependencies.

Direct raw, HTTP receipt, robots and scope artifact bytes are hash-verified. Previously accepted admission ancestors are rechecked for exact retained metadata, cutoff, availability and current audit eligibility; this is not a new parse or byte-level revalidation of all ancestral HTML/XML. Rendering authorization and later evidence acceptance still require their own gates.


## Verification — 2026-09-18

- `npm test`: **419 passed** (413 main including nested SQL cases, plus6 API scope cases); zero failures/skips. Vault precheck:10 guards passed.
- `npm run typecheck` and `npm run build`: passed.
- `node scripts/test.mjs --compiled-render-source`: **28 passed**, including14 foundation and14 new source cases, using compiled JavaScript without tsx.
- Compiled API, isolated DOM, render result/input/manifest and understanding: **45 passed**. Combined compiled executions:73 tests.
- `AIOS_DOCKER_CONTEXT=colima-aios-seo node scripts/test.mjs --render-source`: **28 passed**; the positive source case passes its actual database-derived windows-1252 preparation into isolated Chromium and verifies the input digest, decoded text and0/2/5-second samples.
- `AIOS_DOCKER_CONTEXT=colima-aios-seo npm run test:render`: all13 existing browser scenarios passed. Together with the database-derived case,14 browser scenarios executed. This is fixture proof, not a public-site pilot.
- Specification validation, root/render-worker production dependency audits and vault conformance passed. Both audits report zero vulnerabilities.

Regressions cover same-run/scope/cutoff substitution, missing frozen scope/robots provenance, byte tampering, wrong handler, truncation/XHTML abstention, revocation/cancellation/membership/deletion, post-I/O expiry and state changes, actual raw/sitemap/index/link-source rejection, parent admission-bundle rejection and continued use of independently supported output despite an unrelated rejected bundle member. Reads repeat successfully through a fresh database connection; evidence, render records, outbox and job completion remain unchanged.

The first Docker invocation ran before the local context finished starting and failed to resolve it; after startup, the full browser suite passed. Early test fixture failures included an invalid target state/admission combination and an incorrectly assumed seed-to-sitemap dependency. Corrected fixtures now exercise actual non-seed and parent-index/link relationships. Review found and corrected both missing dependency checks and overly broad suppression before final verification.

GAP-035 closes only this preparation boundary. GAP-008 remains in progress for render admission, persistent resource accounting, independently observed container invocation and atomic artifact acceptance. All195 full capabilities remain incomplete; no real-world or production promotion follows from these counts.
