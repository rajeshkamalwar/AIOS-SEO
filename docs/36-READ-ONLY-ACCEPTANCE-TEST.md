# 36 — Read Only Acceptance Test

Status: frozen conformance scenario contract. [scenarios.json](../spec/fixtures/scenarios.json) gives exact expected values; [artifacts.json](../spec/fixtures/artifacts.json) pins synthetic bytes. Reserved .example URLs are routed to a controlled fixture server by the test harness only; never weaken production SSRF to make fixtures pass.

## End-to-end happy path

Authenticated tenant submits https://orange.example/. Three document URLs are admitted from robots/sitemap/link discovery. Stored home/service/contact artifacts retain provenance. Service page's noindex is observed; actual indexing is unknown. Offering=Household pipe repair and location=Nagpur are provisional public-text inferences. No service radius, qualifications, measured traffic, revenue or rankings are inferred.

Persist Site, Crawl/targets, receipts, Evidence/Observations, PageSnapshots, selected RenderSnapshots, field assertions, BusinessTwin, entity bindings, assertion-backed graph, CapabilityAssessments, proposed Opportunities, StrategyRevision, DecisionRecord and SelfAuditResults. The source artifact and its digest must be retrievable after process restart. Assert initial graph contains home→services and home→contact links, service offering relevance, and a declaration-based canonical; no visibility edges. At most3 next steps, benefit unknown, no executable action. No requirement to fill3 cards.

Customer reading: “This service page asks search engines to leave it out of results. Confirm whether that is intentional.” Do not state that Google removed it. Missing connected sources remain explicit. The client can close/reopen and retrieve the identical publication watermark and underlying persisted interpretation.

## Failure scenarios

The18 named scenarios in fixtures cover public collection, policy-limited rendering, malformed XML, variant identity, partial orphan detection, injection, revocation, missing metrics, publisher/hybrid applicability, two-tenant collision, late correction, duplicate delivery, lease expiry and deletion. Each expected field is an assertion for a future test, not a claimed result. Add raw/header canonical disagreement and expiry at exact deadline to parser/runtime suites; authority/scoping cases permit zero failures.

Implementation tests must create actual DB rows and exercise actual transactions/API/worker processes. A stub model may verify plumbing only with explicitly synthetic output; it does not pass the model quality release. Kill a worker after artifact upload, after DB commit and after delivery but before acknowledgement. Confirm unreferenced blob cleanup, one domain acceptance per attempt and idempotent inbox. An expired worker's write must fail even if its output is otherwise correct. A second tenant using identical URL must receive distinct records and no foreign IDs.

Correction trace: first observation K10, belief K11, later correction K12 with earlier world validity. Query K11 returns prior belief; current query returns new assessment and preserves dispute. Deletion fences in-flight writes and restored data stays unreadable until ledger replay. Partial crawl numbers reconcile; absent pages never become deletion/noindex/zero metrics.

## Verification levels

1. Specification validation: JSON schemas, examples, source/artifact hashes, reference resolution, documentation links and expected-case identifiers.
2. Foundation integration: real PostgreSQL tenant constraints, evidence atomicity, immutable revisions, outbox/inbox and restart tests (M1).
3. Worker/network security: budgets, retries, leases, egress and sandbox failure injection (M2–M3).
4. Model/skill quality: independent frozen held-out evaluation and release (M4).
5. Full persistent product path: API→real fixtures→publication→reopen and business interpretation (M5).

Passing a lower level never implies a higher one. The final read-only Brain is complete only when all applicable levels pass. No external customer data, website edits or production deployment is required for foundational implementation.
