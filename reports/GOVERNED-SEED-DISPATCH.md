# Governed submitted-seed dispatch

Baseline: `2976255`. [ADR-026](../docs/decisions/026-governed-local-seed-dispatch.md) defines the local boundary.

The dedicated installed Skill derives a seed fetch child from the exact completed bootstrap, immutable admission and frozen successor bundle. It verifies retained scope/robots bytes, reconstructed robots results, current source and child releases, scope, audit, freshness and deletion. Current eligibility is checked at lease issuance and before container creation/start/socket dispatch. Rejected candidates roll back their attempted lease and cannot block unrelated eligible candidates through a known audit-policy error.

One unique child and immutable target/attempt/reservation claim prevent alternate-key and retry budget bypass. The first reservation atomically changes the seed to fetching with one attempt, advances its version/knowledge sequence and emits the claim event alongside the permanent HTTP charge. Independent container and socket termination evidence is still required to settle concurrency. Unknown cleanup retains the occupied slot and claim.

The dedicated broker preserves the exact reviewed fixture path, fixed GET,5MiB/20s bounds and no redirect following. The network-disabled worker has no destination authority or credentials. Shared transport extraction preserves the original robots-only adapter. Dispatch returns metadata only; no Evidence, PageSnapshot, target success/reset, fetch/crawl completion or customer/public/write authority is added. Digest-only dispatch history cannot later be promoted to retained Evidence.

## Verification — 2026-09-19

- Full `npm test`: **634 application tests passed** (628 primary plus6 API). The10 vault guard tests are separate.
- Final focused source and compiled suites: **39/39 each**; other compiled regressions61/61, combined compiled count100.
- Final actual Docker suite: **40/40**, including39 overlapping cases and one actual isolated container path. Observed requests were exactly `/robots.txt` then `/services`; redirect was not followed. Target remained fetching and job leased, evidenceAccepted=false.
- Typecheck/build passed. Specification validation:29 schemas,1125 references,46 positive/18 negative examples,12 skill manifests,195 document links.
- Both root and render-worker production dependency audits: zero vulnerabilities.
- Independent review confirmed current source gates, queued-candidate rollback, atomic claim/accounting/event, descriptor cutoff integrity and unchanged bootstrap authority. Diff and vault checks passed.

Regressions cover unknown/denied robots, original attempt proof, altered retained bytes/bundle/projection, current release and audit restrictions before/after unlocked reads, target changes, unique child identity, one-call limits after retry/restart, role/direct-SQL boundaries, claim-event rollback, cross-handler acceptance rejection, late pre-socket changes, uncertain cleanup and unrelated eligible candidate continuation.

The initial test-first run rejected the uninstalled handler. Integration exposed an ambiguous SQL target ID, corrected before verification. Review added reconstructed-result equality and source eligibility at lease issuance. A final regression exposed safe rollback but scheduler interruption on known audit errors; the exact three input-audit errors now follow the existing policy-blocked/skip path. Unexpected errors still propagate. Test expectations were corrected for the existing crawl.started event and earlier fail-closed rejection without weakening persisted invariants.

Final logs: `/tmp/aios-seed-dispatch-full-final.log`, `/tmp/aios-http-seed-dispatch-source-final.log`, `/tmp/aios-http-seed-dispatch-compiled-final.log`, `/tmp/aios-http-seed-dispatch-docker.log`, `/tmp/aios-seed-dispatch-compiled-other.log`, `/tmp/aios-seed-dispatch-spec.log`. These local logs are not production receipts.

GAP-046 closes only this local dispatch prerequisite. GAP-004 remains OPEN. Next is private captured page Evidence acceptance, then projection/completion and further integration. Fixture execution remains TESTED, never REAL_WORLD_VERIFIED or PRODUCTION_PROVEN.
