# Local fixture HTTP process supervision

Baseline: parent05a0760. Extends GAP-005 with an actual fixed local child process and loopback fixture request, without enabling public collection or accepting SEO evidence. Decision: [ADR-015](../docs/decisions/015-local-http-process-supervision.md).

`HttpFixtureSupervisor` reserves capacity, starts a fixed credential-free worker paused, binds its unique invocation through the independent supervisor role, then rechecks current admission before GO. Only a normalized `.example` `/robots.txt` logical URL and trusted internal fixture port are accepted. Transport always connects directly to loopback, without public DNS. The port is test wiring, never customer input.

The parent bounds child lifetime/output and observes spawn, exit and closed pipes. Signal delivery alone is insufficient. The terminal timestamp is captured at the close event; delayed binding cannot manufacture later termination. Absolute monotonic checks fence GO after deadline. The fixed worker forks no subprocesses; tests additionally observe closure of the fixture server socket. Unknown termination, failed binding or invalid chronology leaves the original reservation held. Retained body length is not total decoded consumption: accounting bytes remain null and worst-case charges remain spent.

The worker receives no ambient environment or credentials. macOS injects `__CF_USER_TEXT_ENCODING` even with an empty launch environment; the worker discards that one native key and rejects other keys. The build digest identifies trusted local source/runtime bytes, not a production image attestation. Results contain bounded metadata and a retained-body hash, never the response body.

## Verification — 2026-09-18

- `npm test`: **405 passed** (399 main, including nested PostgreSQL role cases, plus6 API-scope cases); zero failures/skips. Vault precheck:10 guards passed.
- `npm run typecheck` and `npm run build`: passed.
- `node scripts/test.mjs --compiled-http`: **39 passed**, exercising the compiled JavaScript worker and real disposable PostgreSQL/loopback integration. Source mode exercises the TypeScript worker.
- Compiled API, isolated DOM, render result/input/manifest and understanding suites: **45 passed**. Combined compiled runs:84 tests.
- Specification validation:21 schemas,1035 references,130 document links passed.
- Root and render-worker production dependency audits: zero vulnerabilities.
- Docker worker unchanged; no new Docker execution claimed.

Eight new process cases cover success, transport failure, timeout kill/socket closure, conflicting prebound invocation, cancellation before GO, hostile parent preload/secret exclusion, delayed binding after actual process closure, and AbortSignal cancellation (including no reservation for an already-aborted call). An initial macOS startup failure exposed the injected environment key and was corrected before passing runs. Review identified the original late timestamp bug; the observed-close regression now prevents it.

This verifies the bounded GAP-034 local producer. It does not simulate actual supervisor-host death, certify production egress/OS sandboxing, install a live collector handler, accept rendered artifacts or promote any SEO capability to real-world/production maturity. GAP-005, GAP-004 and GAP-007 remain open for their broader integration scopes.
