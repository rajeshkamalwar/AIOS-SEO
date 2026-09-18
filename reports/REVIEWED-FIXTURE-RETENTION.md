# Reviewed synthetic raw retention checkpoint

Parent baseline: `e937e79`. Scope: GAP-039 synthetic raw acceptance and reuse. Scoped implementation and verification are complete.

[ADR-021](../docs/decisions/021-reviewed-synthetic-raw-retention.md) rejects unreviewed raw bodies and metadata before upload, keeps accepted bytes/hashes unchanged, and withholds unreviewed legacy content at raw read/reuse boundaries. It is not a general HTML sanitizer or customer privacy certification.

Functional RED tests against an isolated copy of the prior committed implementation demonstrated that prohibited raw content and arbitrary allowed-header values were accepted, caller mutation changed legacy capture behavior, and credential-bearing Site URLs were admitted. The shared repository was not reverted to produce that evidence. Subsequent results will be recorded here.

## Implemented boundaries

The checked-in corpus accepts exact known raw fixtures and finite reconstructed sitemap/robots sequences, with restricted synthetic hosts/UUID hosts, enumerated paths and bounded numeric metadata. It rejects arbitrary HTML/JSON and opaque HTTP metadata. Source/request/final/scope URLs use the closed reviewed identity set; ordinary query text is rejected as well as recognized credentials. Registering a synthetic Site does not exempt its receipt from those limits.

`Ledger.accept` snapshots caller capture/principal/bytes; HTTP acceptance snapshots its envelope. All reviewed-content checks run before upload. Exact accepted raw bytes retain `none-v1`, their original digest and byte locators. The fix does not rewrite raw HTML or pretend that catalog admission is redaction.

Existing raw content receives the same current catalog checks on expert read, HTTP projection, frontier extraction and render-source preparation. Generated HTTP/scope receipt kinds are authenticated using stored acceptance relations, and retained JSON must match canonical serialization exactly. Duplicate JSON keys cannot conceal ignored payload text. Rejected historical content remains identifiable without deletion or relabeling; these paths withhold its bytes/use. This is not a purge or full historical derived-publication recertification.

Actual Docker privacy tests now start from reviewed clean source with empty controls, then verify that those real controls are removed in the retained DOM projection. Hostile form/credential sentinel cases remain in transient worker-output tests. The raw frontier fixture no longer stores a credential-query anchor; parser/URL rejection coverage remains separate.

## Verification chronology

The initial full compatibility run found one missing explicit synthetic hostname in the catalog. The existing cancellation test remained unchanged; the finite hostname list was corrected. A subsequent complete run passed529 application tests. Final review then identified the generated scope-URL channel described above; it was fixed and regression-tested before final verification. Two existing API conflict fixtures also needed their explicit known hostnames enumerated. Unreviewed fixture admission now maps to the canonical policy_blocked API response instead of an internal error; a no-Site-write/non-disclosure regression covers that mapping. No general string fallback was added.

Focused source and compiled raw-retention cases passed40/40 before the additional scope tests. Source/prepared-browser regression passed31/31; actual render acceptance passed28/28 and actual completed-job projection passed25/25 with the existing pinned renderer image `sha256:4a4290232b4c2b068ccec9b781fa9da4902fb3c096d34ca82d23a727b471f08e`. Each of those opt-in suites overlaps normal protocol tests; its actual browser execution is a distinct checked path, not real-world SEO proof. Final combined counts follow after the final scope correction completes verification.

Typecheck/build passed. Specification conformance passed23 schemas,1056 references,37 positive/10 negative examples,10 skill manifests and165 document links. Both application and renderer production-dependency audits reported zero vulnerabilities. No new library or service was introduced.

The raw-content guard is a local synthetic-adapter policy only. Real customer/public-content admission, retention transformation, terms and deployment authorization remain separate canonical gates. This checkpoint enables neither public observation nor website writes.

Final combined compiled verification passed69 affected persistence/catalog/reuse cases plus61 existing API/parser/render/understanding cases, totaling130; no failures/skips. Actual Chromium verification covers three paths within the31/28/25-case source/acceptance/projection suites; these suites overlap normal tests and each other, so their totals are not added as new coverage.

Final full verification passed **533 application tests** (527 primary plus six API-scope tests), with zero failures/skips. Ten vault-generator guards passed separately. The two alternate API-host entries were initially missed by a text edit; the still-failing conflict regressions caught that, and a direct catalog regression now pins their admission. The final passing run includes the API policy mapping and all legacy/scope protections. Typecheck/build/specification validation passed; production dependency audits remain zero. Captured run logs are `/tmp/aios-reviewed-passing-full.log`, `/tmp/aios-reviewed-passing-compiled.log` and `/tmp/aios-reviewed-final-compiled-other.log`; these temporary logs are not production evidence. Independent scoped review found no remaining closure blocker.
