# N1 implementation report

## Current scope

The low-level HTTP collector now shares canonical URL admission and address filtering with perception. It rejects special-use IPv4/IPv6, translated/mapped addresses, malformed/mixed DNS answers, unsafe initial and redirect URLs, credential queries and action-like URLs. DNS includes bounded CNAME traversal and cancellation. Each new hop resolves again; its connection uses the validated IP while retaining the hostname for HTTP and TLS verification.

Transport enforces an absolute deadline, connect/header deadlines, 32KiB header cap, bounded decoded and transferred bodies, and gzip/deflate/Brotli decoding. Exact-cap bodies remain complete; overflow terminates the stream and marks its prefix truncated. Unsupported MIME and redirects stop at headers. Cookie/authentication/custom headers are excluded from returned receipts. Production transport does not use ambient proxy agents.

## Regression evidence

The initial regressions failed on reserved addresses, admission bypass, fragment forwarding and invalid limit overrides before the fixes. The expanded suite exercises real loopback HTTP streams: boundary sizes, multi-chunk overflow and early close, decompression bombs, successful decompression, corrupt/truncated transfers, unsupported MIME/encoding, oversized headers, absolute slow-trickle timeout and HTTP Host. A self-signed TLS server is rejected before HTTP dispatch. Unit cases cover DNS mixed answers, rebinding, alias cycles/depth, family mismatch, DNS timeout, redirect scope/limits, URL policy, secret-header exclusion and permitted ordinary public addresses.

These are local conformance tests, not production firewall/sandbox certification or a live customer crawl. ADR-010 records the conservative transport choices.

## Remaining N1 acceptance

Governed live dispatch, complete durable frontier transitions, integrated per-hop accounting, retries/fairness and governed live-render integration remain required. Subsequent checkpoints below record completed prerequisites; storage and synthetic fixture acceptance do not establish live-worker acceptance. The collector is not integrated as a customer-facing live execution path. N0 deployment/privacy approval and independent network enforcement still gate customer URLs. No inference or website-write behavior was added.

## Collector safety checkpoint verification

- `npm test`: 194 passed, zero failed/skipped.
- `npm run typecheck` and `npm run build`: passed.
- `spec/validate.py` using the specification virtualenv: passed (19 schemas, 989 references, 31 positive and 4 negative examples).
- `npm audit --omit=dev`: zero vulnerabilities.
- `git diff --check`: passed.

## Discovery-admission prerequisite checkpoint

Robots now handles agent groups, specific-agent precedence, query/wildcard/octet rules, malformed bytes and HTTP failure/unknown policy. Strict sitemap parsing adds XML entity decoding, structural locations, text files, index separation, exclusion counts, and traversal caps. Frontier adds same-origin scope, twenty query variants, full-string identity and a cumulative 500-admission ceiling. The composed M5 fixture used literal backslash-n instead of newlines; corrected its input rather than weakening strict parsing. Built perception libraries now include their discovery policy JSON.

Verification: 213 tests pass, typecheck/build and compiled perception import pass, specification validation passes, production audit has zero vulnerabilities. ADR-011 records the parser dependency and scope. These changes do not enable customer collection.

## Durable storage prerequisite checkpoint

Migration 004 adds canonical CrawlTarget, Page and PageSnapshot storage, tenant/site/run composite references, record-spine registration, full-normalized-URL identity, admission/truncation/temporal checks and forced RLS. It grants reads only. Migration-owner test fixtures verify schema roundtrip, duplicate identity rejection, cross-scope references, pooled scope reuse, denied unfenced writes and actual PostgreSQL crash/restart. This is storage groundwork, not worker result acceptance or content/evidence coherence verification.

Verification: 219 tests pass, typecheck/build/specification validation pass, production audit has zero vulnerabilities, diff checks pass. The next dependency is narrow, authorized frontier creation and later atomic lease-fenced evidence/observation/snapshot/outbox acceptance.

## Durable submitted-target checkpoint

`Jobs.submit` now creates one unadmitted `discovered` target in the same transaction as the crawl and `crawl.requested` outbox event. A narrow database function derives scope from the queued crawl, checks the submitting principal's current authorization and exact stored site URL, and grants no table write or page-fetch authority. Retry with the same idempotency key preserves the original target. Tests prove no-scope/foreign-URL rejection, denied direct admission updates, and rollback of both seed and crawl when event insertion fails.

Verification: 221 tests pass; typecheck/build/specification validation pass; production audit has zero vulnerabilities; diff hygiene passes after removing a trailing blank line.

## Retained HTTP receipt and local integration checkpoint

Added `Ledger.acceptHttpFixture`, explicitly limited to authorized synthetic fixture scopes. Existing canonical HTTP receipt JSON is stored alongside the optional body; server-generated IDs link both artifacts to one Observation and outbox transaction. Context hashes bind exact retained receipt bytes. Status and truncation are supplied observations, never inferred defaults. Timeout failures retain null status/body and an explicit error. Changed bytes or receipt under the same attempt conflict; foreign scope, secret headers and forged references fail. Failed transactions leave only sweepable private orphans.

`collectPublicHop` performs exactly one request and returns an admitted redirect destination for a later separately reserved job. It does not implement retries or durable budget reservations itself.

The integration fixture runs a real loopback server, observes robots first, parses a sitemap, omits a disallowed page, collects allowed pages, retains exact bodies/receipts and reopens their frozen bundle after reconnect. The advertised `.example` URLs are explicitly mapped to a local fixture transport. This is genuine local HTTP/DB/blob integration, not a customer-domain crawl or production egress certification.

HTML decoding now uses pinned `html-encoding-sniffer` 6.0.0 for the standard bounded meta/BOM prescan and Node's fatal decoder. This workload needs browser-compatible encoding detection rather than a hand-written meta regex. Unsupported/ambiguous declarations and undecodable bytes stay `parse_failed`; unsupported MIME stays `not_applicable`. Transcoded text does not replace original artifact bytes/hashes/locators. [Library behavior](https://github.com/jsdom/html-encoding-sniffer).

Verification: 234 tests pass; typecheck/build and compiled imports pass; specification validation passes; production dependency audit has zero vulnerabilities. No new production profile or external authority was activated.

## Fenced projection and persistent HTTP accounting checkpoint

`Jobs.projectHttpFixture` derives a Page and PageSnapshot only from accepted synthetic HTTP artifacts in the leased project's frozen bundle. It checks exact membership, temporal cutoff, retained body/receipt digests, source linkage and lease/release/deletion/health gates again after artifact I/O. A narrow scheduler-only database function rechecks persisted authority; snapshot, provenance, job completion and outbox commit atomically. Page classification remains unknown. Both Page and snapshot provenance reject later runtime additions. Duplicate delivery, corruption, missing or foreign artifacts, cancellation/revocation, expired leases and outbox rollback have regressions.

`HttpLane` reserves an HTTP attempt and worst-case decoded bytes durably before a future dispatch. Shared scheduler counters enforce two active attempts and one-second spacing across tenants/runs; dotted/undotted DNS names and HTTP/HTTPS variants share the conservative hostname lane without changing Site identity or receipt URLs; run caps are 750 attempts and 250MiB decoded, with a 5MiB maximum reservation. Generic budget accounting includes each attempt so its API cannot independently overspend or refund it. Reconnect preserves reservations and idempotent settlement. Unknown crash slots remain occupied until trusted settlement; cancellation is not evidence that a remote request stopped. These receipts grant no network authority, and no live dispatcher is installed.

A combined integration test now follows real loopback HTTP robots admission through retained body/receipt evidence, a frozen bundle, signed fixture job, leased projection and snapshot readback through a fresh runtime pool. It proves a denied URL is never dispatched and preserves the actual HTTP status rather than inventing success. This does not establish a complete crawl runner, production egress or customer-domain execution.

Verification: 248 tests pass; typecheck/build/specification validation pass; production dependency audit has zero vulnerabilities; diff hygiene passes.

## Offline isolated-render conformance checkpoint

Added a one-shot, digest-pinned Linux/Playwright worker for explicit synthetic HTML replay. The Docker harness supplies no mounts or credentials, disables network access, runs nonroot with Chromium's sandbox, drops all capabilities, applies no-new-privileges/read-only root and bounds CPU, memory, PIDs and temporary storage. Worker probes verify Linux restrictions and Chromium namespace/PID/network/seccomp status. Only the initial fixture document is fulfilled; every other request is denied. This is real JS execution in a local container, not customer-site rendering or production escape-resistance certification.

Seven executable Docker regressions pass: 0/2/5-second DOM mutation samples; denied external/private GET, POST, beacon, socket and popup; actual 100-attempt termination; changed-URL context rejection; non-fixture URL rejection; hung-page failure without invented DOM; host deadline with confirmed container removal. Review corrected an initially diagnostic-only attempt cap and ensured terminal receipts kill late asynchronous setup. ADR-012 records the boundary and seccomp compatibility choice. Raw evidence acceptance, render job authority, resource replay provenance, independent live egress and production activation remain open.

Verification: 248 normal tests and seven separate Docker regressions pass; typecheck/build/specification validation pass; root and isolated-worker production dependency audits both report zero vulnerabilities; diff checks pass.

## HTTP accounting restart regression

A real immediate PostgreSQL stop/restart now proves that active HTTP reservations, both global slots, attempt charges and conservative decoded-byte charges survive. Reopened services reject new work while slots/caps remain occupied. The previously authenticated receipt can settle exactly once after cancellation without refunding budget.

Unknown worker termination remains distinct from lease expiry. Automatic reclaim requires a future reservation-to-invocation binding and independent terminal supervisor/egress receipt; none exists yet, so no timeout-based slot release is added. This is an explicit dispatcher-integration dependency, not permission to infer completion from a missing heartbeat.

## Inert HTML extraction checkpoint

Added deterministic extraction of title, canonical/base declarations, named metadata (including robots), resolved anchors and qualified main-text candidates. Every retained value has the original evidence ID, digest, parser version and half-open byte locator. Tests cover malformed HTML, literal versus absent/empty fields, hidden metadata semantics, foreign/base destinations without fetch authority, UTF-8/UTF-16/Windows-1252 byte mapping including astral characters/BOM/CRLF, and partial-source qualification. XHTML and encodings without an exact locator map abstain. Static text is never labeled computed-visible; no raw/render mismatch, SEO defect or business claim is produced.

Pinned `parse5` 8.0.1 is justified by HTML's tolerant tree-construction semantics and source-location support; regex extraction cannot correctly handle raw text, entities, malformed nesting or source positions. Its [parser options](https://parse5.js.org/interfaces/parse5.ParserOptions.html) and [character-based offsets](https://parse5.js.org/interfaces/parse5.Token.Location.html) require explicit original-byte mapping. The application node cap applies after parsing, so future live use still requires isolated CPU/memory execution. This pure library has no pipeline consumer or network authority yet.

Verification: 264 normal tests and seven Docker regressions pass; typecheck/build/specification validation pass; production dependency audit reports zero vulnerabilities; diff checks pass. The Docker build context now explicitly includes only worker runtime files, excluding unrelated files or credentials.

## Bounded parser execution checkpoint

`extractHtmlIsolated` runs the trusted inert HTML parser in a separate V8 worker with a 64MiB old-generation heap, 16MiB young-generation heap and two-second result deadline. Input and context are bounded before structured clone, no process environment or preload arguments are forwarded, conflicting heap overrides fail closed, and worker termination is awaited before returning. Late results, timeout and memory failure return explicit `not_extracted` rather than empty success. Original source-byte locators remain identical to the pure extractor.

This is a CPU/heap budget, not an OS boundary or permission to execute page JavaScript. [Node's resource-limit documentation](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#new-workerfilename-options) excludes external ArrayBuffers and process-wide OOM; live workers still need process/container limits. Regressions cover pathological trees while the parent remains responsive, subsequent reuse, no lingering ports, source/context budgets, integrity failures and heap-override refusal. The compiled adapter is exercised separately from the source loader.

The offline browser worker also checks cancellation after asynchronous capture boundaries so a timed-out coroutine cannot append a later sample or overwrite terminal state. Its existing seven Docker regressions continue to pass.

Verification: 272 normal tests, eight compiled parser-worker tests and seven Docker regressions pass. Typecheck/build/specification validation pass; production dependency audit reports zero vulnerabilities; diff checks pass. Live customer URLs remain blocked by the canonical N0 deployment/data-use approval gate; complete frontier dispatch, independent live egress and governed render-evidence acceptance remain N1 integration work.
