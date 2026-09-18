# Post-vault read-only corrections

Date:2026-09-18. Parent checkpoint:673a11b (repository-linked vault baseline). The containing implementation commit records these changes. Scope: GAP-025, GAP-026 and control-layer guard tests; no live/customer collection or website-write authority.

## GAP-025 — submission deadline

`PostgresReadOnlyStore` previously created one deadline when constructed. After twenty minutes, new submissions inherited an expired budget. The real PostgreSQL/API-store regression failed with `deadline` before correction.

The fixed server-owned read-only budget now enters `Jobs.submitDiscovery`. Under the existing admission lock, PostgreSQL time assigns a deadline once for a new run. Same-key retries use the original persisted deadline and compare the complete original site/budget/policy hash. Explicit caller-budget submissions retain strict conflict behavior. Membership, policy health and deletion checks still precede replay.

Regression coverage includes a store constructed21minutes earlier, delayed host time, a fresh pool/store, concurrent retries, same key/different site, changed explicit limits, nondefault budget replay, an actually expired stored deadline, revoked membership, unhealthy policy and deletion. Retried work retains one original run/budget/outbox event; it receives no renewed execution budget.

## GAP-026 — graph endpoint integrity

Two focused regressions failed before correction: a201-node graph returned an edge to omitted node201, and missing-endpoint edge omission was not reflected in `truncated`.

Projection now selects at most200nodes first, filters edges against that returned set, then applies the400edge ceiling. Any actually omitted input node/edge sets `truncated`; ordering, provenance and the existing null cursor remain unchanged. Tests cover both omitted endpoints, unrelated missing endpoints, exact limits and over-limit edges. No pagination, graph database, fake node or deduplication behavior was added.

Both fixes received code review against their canonical boundaries. Scoped local defects are closed; full graph/Twin/client/API delivery and deployed proof remain open. In particular [GAP-028](../vault/gaps/GAP-028.md) records remaining API serialization/pending-state/query parity rather than hiding it under this deadline fix.

## Vault checkpoint enforcement

Ten isolated standard-library regressions test stale five-view detection for implementation/scripts/dependencies, missing capability/link detection, unbacked real-world/completion claims, permanent gap deletion, history rewriting, state/history mismatch, legitimate appended history and inclusion of new untracked project artifacts. Tests mutate only private temporary copies and private Git histories. `npm test` runs vault consistency and guard tests before the application suite.

The first final snapshot check failed because an untracked new report was omitted by the test-copy harness. GAP-029 records the failure and correction; the final10guard suite passes without staging-dependent behavior or copying unrelated user files.

Current full-capability status stays DEFINED/INCOMPLETE for all195rows. Local prerequisites, closed defect scopes and open domain delivery gaps remain separate. Aggregate domain gaps can narrow their explicitly affected capability set with evidence; unrelated siblings need not complete together.

## Actual verification

| Check | Result |
| --- | --- |
| `npm test` |357 normal tests passed;0failed/skipped; pretest also ran9vault guard tests |
| `npm run typecheck` |Passed |
| `npm run build` |Passed |
| Compiled parser/replay/manifest/understanding tests |33passed |
| Specification validator |Passed:21schemas,35positive and8negative examples |
| Root production dependency audit |0vulnerabilities |
| Isolated-renderer production dependency audit |0vulnerabilities |
| Vault consistency / checkpoint history checks |Passed; final standalone suite10guards |
| Diff checks |Passed |

The renderer/egress worker and Docker harness are unchanged. Their13passing Docker regressions remain retained evidence from2b6d527, not a new run for this API/graph correction. These results do not establish real-site SEO behavior, production identity, deployed egress, model quality or production reliability.

The approved N0 deployment/data-use profile remains a prerequisite for live customer processing. It does not prevent further dependency-ready local read-only integration. Remaining work is tracked in the vault rather than erased at this checkpoint.
