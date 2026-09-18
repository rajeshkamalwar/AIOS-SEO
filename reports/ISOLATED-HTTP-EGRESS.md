# Isolated local HTTP egress checkpoint

Parent baseline: `6131ee2`. Scope: GAP-041, a bounded local prerequisite of GAP-007/004/005. Full product and live egress gaps remain open.

The scoped local implementation and verification are complete. The accepted decision is [ADR-020](../docs/decisions/020-local-http-egress-mediation.md).

The isolated collector can request only its pre-authorized one-hop fixture operation over bounded stdio. It cannot choose a URL, port, method or headers. A trusted host broker owns the one loopback socket and returns metadata only. Both the container and broker must have independently observed termination before HTTP accounting can settle. No Evidence upload, public collection, customer activation or website-write capability is added.

## Verification evidence

Final full source verification passed **509 application tests** (503 primary plus six API-scope tests); ten vault-generator guard tests passed separately. The compiled focused suite passed36 cases and the existing compiled API/parser/render/understanding suite passed61, for **97 compiled tests**. These compiled suites overlap source cases and are not additional capability coverage.

Actual Docker verification passed38 cases:36 protocol/persistence overlaps plus two actual container cases. One executes the allowed mediated hop; the other runs a separately built immutable hostile fixture with the same required container policy and verifies blocked direct TCP/DNS, no ambient secret/Docker socket, nonroot/seccomp/no-new-privileges/zero effective capabilities/read-only filesystem, repeated-request rejection and independent removal. The final strengthened probe additionally checks that only loopback interfaces exist and attempts IPv6 loopback, metadata and documentation destinations. The strengthened actual Docker suite also passed38/38; all results remain scoped local evidence.

Fixed normal image: `sha256:06921e104ac0b535a56095cde72971d1844e5420e5010cb9ff25367851f0297c`. Base pinned in [Dockerfile](../workers/http-fixture/Dockerfile). No NPM dependencies are installed in that worker. The fixed image contains Node24.21.0. PostgreSQL17 and Docker on the dedicated local Colima profile provide actual persistence/container execution, not production certification.

Typecheck/build passed. Specification validation passed23 schemas,1056 references,37 positive and10 negative examples,10 skill manifests and161 document links. Application and existing renderer production-dependency audits returned zero vulnerabilities; this does not constitute an OS-image vulnerability audit.

Initial RED verification failed on the not-yet-created producer import; no acceptance criteria were weakened. Reviews of broker closure, fixed IPC, producer authority and terminal accounting found no remaining scoped blocker.

## Remaining boundaries

The worker cannot select any network request parameters. The trusted fixture broker deliberately substitutes loopback for the logical `.example` URL; it does not resolve or connect to that public identity, validate public TLS, install a live governed HTTP skill or follow a redirect. Existing library DNS/address/TLS behavior and this OS-deny test are distinct evidence. A configured immutable image and trusted Docker daemon are operator-controlled infrastructure, not customer inputs.

A failure after entering broker admission but before obtaining its closure receipt conservatively retains the reservation, even if the current gate prevented socket creation. Independent recovery is required; no timeout clears it. Confirmed transport errors can settle only after actual socket/request closure and confirmed container removal. Full worst-case byte charges remain permanent.

No response body, Evidence, PageSnapshot or completed crawl job is produced by this checkpoint. No raw-retention gap is closed. Parent GAP-007 remains open for deployed public egress; GAP-004/005 retain live dispatch, acceptance and recovery work. Capability maturity remains DEFINED with local prerequisite TESTED, never REAL_WORLD_VERIFIED or PRODUCTION_PROVEN.

Final source rerun:509/509 application tests, no failures/skips; compiled focused rerun36/36, existing compiled suite61/61; strengthened Docker38/38. Final typecheck/build passed. Logs were captured under `/tmp/aios-http-isolated-final-*` and `/tmp/aios-http-isolated-docker.log`; this report records durable outcomes without treating temporary paths as retained operational evidence.
