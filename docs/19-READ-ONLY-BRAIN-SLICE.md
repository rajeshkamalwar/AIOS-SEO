# 19 — First Read-Only Brain Slice

Status: executable-behavior specification, not permission to implement. [13](13-IMPLEMENTATION-DEPENDENCIES.md)'s foundation decisions remain open. Phase 2 explicitly selects **URL → persistent public understanding → evidence-backed opportunities** as the first slice. The proposed title actuator in 13/D04 remains a later experiment, never a dependency for this slice.

## 1. Product and authority boundary

Input: one website URL within an authenticated tenant session. Output: a durable, inspectable understanding of the observed site, provisional business context, initial real graph, scoped technical findings and at most three material next steps. Customers see business meaning and missing information; experts can inspect exact evidence. **Website modification is an actuator for Search Growth, not the product.** No website mutation, publication, form submission, indexing submission or customer outreach is permitted.

Read-only concerns the external website and platform accounts. AIOS must write its own scoped run state, evidence, Twin, graph projections and decision memory. “No writes anywhere” would contradict persistence. Public fetching can create ordinary access logs; the collector does not promise zero external incidental effects. It intentionally performs only allowlisted observation operations and blocks known action routes and mutating methods.

No GSC, Bing, analytics, rank, SERP, backlink or AI-answer dataset is required or synthesized. Their coverage records begin `not_connected` or `not_observed` as appropriate. Candidate query phrases can be inferred but carry no observed volume/rank. The graph may contain provisional topics/offerings, never invented visibility edges.

## 2. Scope and starting limits

Choose a small single-site service business as the first acceptance fixture, while testing a catalog, publisher, SPA and hybrid as negative/conditional cases. This is a reversible engineering fixture recommendation, not a decision to exclude other customers permanently.

Proposed versioned `DiscoveryPolicy@1` defaults, to be load-tested before production:

| Limit | Initial bound / reason |
| --- | --- |
| Input | HTTP(S) only; no userinfo, local names, private IPs, fragments as separate documents or credentials in query values |
| Page frontier | 500 admitted HTML/document URLs; maximum 5,000 discovered candidates recorded with truncation counts; no claim of total site size |
| Crawl depth | 6 observed link hops from seed; sitemaps are independent discovery sources |
| Fetch concurrency | 2 per origin, minimum 1 second between request starts; slower server retry guidance wins |
| Fetch budget | 750 HTTP-lane request attempts including robots, sitemap and redirect requests; at most 2 retries per retryable request, within the same budget |
| Response bound | 5 MiB decoded per HTML/XML response; reject excessive compression and streaming overflow; no external XML entities |
| Redirects | At most 5 hops; revalidate DNS/IP/egress each hop. Same-host HTTP→HTTPS can be admitted; other origins become candidates for policy-scoped follow-up, not an automatic ownership merge |
| Render sample | At most 20 page navigations, one per selected role/template first, then critical raw/render discrepancies; repeated renders count against this cap |
| Render execution | 20 seconds per navigation, 100 network requests and 10 MiB transfer per page (a separate render budget, at most 2,000 requests/200 MiB per run); one browser at a time per run |
| Total run | 20-minute deadline; publish partial evidence with exact unmet work, not a synthetic completion |
| Inference | At most 8 model calls and 40,000 total input/output tokens; reserve configured currency cap before each call, no vendor/model price assumptions |
| Repeat | Initial run plus explicit new request; future cadence may re-observe under a separate active schedule/grant. Persist a recommended next wake condition, do not silently schedule indefinite crawling |

Source-specific scope limits can narrow these defaults. Budget accounts include failed/retried work and reserved in-flight work atomically; concurrency cannot overspend by racing reservations. At exhaustion, produce `partial_budget` and deterministic next eligible work, never run an unbounded “finish the audit” loop. Privacy/retention/region choices in 23 must be resolved before real tenant processing.

## 3. Tools and trust boundaries

| Tool contract | Allowed inputs / result | Mandatory restriction |
| --- | --- | --- |
| `http.fetch_public@1` | Authorized public URL, context, conditional headers and limit policy → status/headers/limited artifact/hops | No credentials/cookies; no authenticated or known destructive endpoints; DNS/IP recheck through controlled egress |
| `robots.evaluate@1` | Bounded robots artifact/status, agent and URL → applicable decision + rule locator | Parser deterministic; uncertain policy fetch fails conservatively for new crawl admission |
| `sitemap.parse@1` | Scoped artifact → entries/index links/errors/truncation | Disable entity expansion; nested index/count limits; no automatic offsite fetch |
| `render.observe@1` | Admitted page URL and fixed browser context → DOM/network/console/timing/coverage | Isolated OS sandbox, private-network denial including subresources, no credentials; no forms, checkout, clicks, downloads, service-worker persistence or browser mutation automation |
| `html.extract@1` | Artifact hash + parser version → typed content/meta/link locators | Scripts are data outside the renderer; sanitize user-visible HTML; preserve original evidence reference |
| `model.infer_scoped@1` | Redacted tenant evidence bundle, task schema, approved provider and token budget → validated candidate | No tool credentials or direct network; data-routing constraints survive fallback; invalid output cannot become a fact |
| `artifact.read_scoped`, `graph.query_scoped` | Authenticated scope and explicit IDs/time → permitted records | Tenant checks precede retrieval/ranking and every artifact lookup |
| `assessment.record@1` | Expected revision, typed outputs and manifests → domain receipt + outbox events | Domain validation, not arbitrary database write; stale/cross-tenant references denied |

The public renderer allows only observational GET/HEAD requests under endpoint and resource policy; blocks POST/PUT/PATCH/DELETE, beacons, WebSockets and background persistence. A site that requires a POST data API is marked `render_limited_by_policy`; it is not labeled broken. Supporting such reads later requires an explicitly classified provider endpoint, never blanket POST permission. Form tests and real interaction-based INP measurement are outside this slice. “GET” alone is not proof of safe semantics; known action routes and credential-bearing URLs are excluded, redirects and subresources receive the same checks.

Third-party static resources can be admitted by the renderer's public-resource policy with public-IP validation and budgets; this does not add their sites to the crawl frontier. Cookie/consent gates are left intact and reported. Bot challenges are not bypassed. Public collection observes robots for AIOS's declared agent; any simulated engine directive evaluation is labeled as analysis, not impersonated collection. A robots-unavailable conservative stop is an AIOS policy choice, not a statement that every search engine stops identically.

Render readiness is a reproducible sampling rule, not proof that a page has finished all possible work: capture the DOM at DOMContentLoaded and at 2 and 5 seconds afterward, subject to the 20-second navigation limit. Record pending requests and critical-content changes at each capture. Stability across the last two samples supports only stability in that observed window; timeout, late-changing content or policy-blocked dependencies remain explicit. Do not equate network-idle with correct rendering. The chosen schedule is an AIOS fixture default that can be revised with a new collection-policy version.

### Proposed API boundary

These are semantic endpoint contracts for Phase 3 serialization; no routes have been implemented. `POST /v1/sites/discovery-runs` accepts URL, client idempotency key and optional policy-approved narrower limits, and returns 202 with durable run ID. It derives tenant identity from the authenticated session. Reusing a key with different input returns conflict, never a second crawl. Client-provided tenant IDs cannot widen scope.

`GET /v1/discovery-runs/{id}` returns stage, completion reason, coverage and available projection watermark; failures are explicit and may still include partial artifacts. `POST /v1/discovery-runs/{id}/cancel` cancels future internal work without claiming in-flight requests were undone. `GET /v1/sites/{id}/understanding` returns the current Twin/baseline/opportunities plus last observation time. These internal commands do not authorize external website edits.

`GET /v1/sites/{id}/graph` accepts authorized root entity, radius (maximum 2), node budget (maximum 200), edge budget (maximum 400), temporal cutoff and opaque continuation cursor. Results include truncation, projection watermark and evidence drill-down references; no random synthetic filler. Cursors bind scope, query and watermark; expired/changed-watermark cursors require a fresh query rather than mixed-snapshot pagination. Filters apply before counts and traversal; unavailable evidence returns a typed retained-metadata explanation subject to access policy.

Typed failures include invalid URL, forbidden destination, scope denied, run conflict, budget exhausted, source unavailable, partial collection, revoked skill and projection pending. No error payload leaks another tenant's existence. An absent projection is pending/unavailable, not an empty knowledge graph. Endpoint schemas, authentication details and status-code mapping are Phase 3 deliverables.

## 4. Durable execution and transition guards

`requested → validating → discovering → collecting → analyzing → validating_outputs → published` with waiting/retry states from 10. Terminal run statuses: `complete_in_declared_scope`, `partial`, `blocked`, `failed`, `cancelled`. Status is separate from each capability assessment's finding/cannot-assess result.

| Stage / owner | Inputs and guard | Committed result / recovery |
| --- | --- | --- |
| Request / access | Authenticated tenant, valid URL, idempotency key, budget admission | Run and provisional SiteScope; repeated same key returns same run; different tenants never share private state |
| Identity / registry | Original URL plus safe parsing/resolution | Normalized lookup key, origin and alias candidates; no canonical-driven merges or implied ownership |
| Discovery / perception | Scope, robots decision and budget | Frontier entries with discovery edges and admission status; each enqueue idempotent by run + normalization version + URL key |
| Collection / workers | Scoped lease, released read skill, admitted frontier item | Attempt receipts, artifact/observation IDs and coverage; retries preserve attempted contexts |
| Rendering / perception | Matched raw capture and sampling rationale | Separate render observations, readiness conditions and limitations; never overwrite raw evidence |
| Understanding / domain | Accepted observation manifest and model constraints | Typed page roles, business/offer/location claims, topic/entity hypotheses, provisional Twin revision |
| Diagnosis / skills | Applicable rule release and sufficient observations | Findings and competing explanations; incapable checks marked unknown |
| Strategy / core | Twin revision, findings, business constraints, budget | Initial investigate/observe plan, selected/deferred opportunities, no-action option and next wake condition |
| Publication / independent validator | Valid sources/skills, evidence links, tenant scope, schema, no invented metrics | Business/graph read models with watermark; scope mismatch quarantines outputs |

Collection commits an artifact reference only after storage succeeds and hash/size are known. An unreferenced uploaded object is garbage-collected under retention policy; it is not evidence available to a decision. Worker restart resumes from committed frontier and attempt state. Re-delivery cannot duplicate a canonical observation for the same attempt, but a deliberate new fetch is a new observation. Projection replay never re-fetches sites or notifies users.

During analysis, pin the input cutoff and release manifest. New observations advance a dirty watermark and can trigger a later revision; they do not silently alter a decision halfway through. One strategy revision per scope commits through expected-version checks. A revoked skill before publication quarantines its derived conclusions until independently re-evaluated. A crash leaves a recoverable run, not an invented success card.

## 5. Required output records

All records include stable ID, tenant/site scope, schema version, valid/observed and recorded times as applicable, producer version and evidence/derivation references. A field whose value is unavailable uses `{status, reason, evidence_refs}`; it must not carry a fabricated numeric value.

| Record | Required domain fields / invariant |
| --- | --- |
| SiteIdentity | Original URL, parsed/normalized key, normalization version, admitted origins, redirect candidates, control status=`unverified` |
| CrawlRunSummary | Seed, policy version, attempts, discovered/admitted/visited/excluded/failed/deferred sets, limits, completion reason and sampling plan |
| URL/Page inventory | URL ID, discovery provenance, response status/context, observed page revision hash, provisional page type, parent/alias assertions |
| Raw observation | Request/final URL, headers/status/hops, body artifact/hash, timing, parser status and byte truncation |
| Render observation | Raw observation reference, browser/config, viewport/locale, start/end, readiness/timeout, DOM artifact, failed/blocked resources, critical deltas |
| Technology observation | Observed marker locators, inferred technology/render mode, alternatives and confidence basis; exact version only with reliable evidence |
| Technical baseline | Capability assessment IDs for delivery/directives/canonical/parity/links, applicability, sufficiency and missingness; no global SEO score |
| TwinRevision | Inferred business/archetypes, offerings, service/location claims, audience hypotheses, constraints known/unknown, material questions, field-level evidence |
| Graph projection | Real entity and assertion IDs, typed predicates, provenance, belief state, valid/recorded time, watermark and truncation; inferred edges labeled |
| OpportunityAssessment | Search objective, business-relevance path, target, evidence/contradictions, recommendation, unknown benefit/value, risk/dependencies, expiry |
| DecisionRecord | Selected/deferred/abstained alternatives, exact input manifest, skill/model versions, policy receipt, rationale summary and next observation condition |
| Coverage ledger | Each source/check marked observed/partial/not_connected/not_observed/not_applicable/failed; displayable reason |

Inventory accounting: admitted = terminal visited + terminal failed + excluded-after-admission + pending/deferred, with sets disjoint. Discovered-but-not-admitted URLs are reported separately. “Complete” describes the admitted declared scope under the cap, not the whole website. Main-content extraction quality and page-role classification have independent uncertainty.

Initial graph predicates: `business_offers`, `serves_location` (inferred until supported), `page_describes_offering`, `page_mentions_entity`, `page_links_to`, `declares_canonical`, `observed_at`, `finding_targets`, `opportunity_addresses`. No `ranks_for`/`converts_to` edges without corresponding observations. A seed URL with a blocked crawl can still produce a truthful small graph of site, attempt and coverage limitation.

## 6. First opportunity rules

Select at most three: reproducible high-consequence access problems; conflicting identity/directive signals affecting relevant pages; missing decision-critical business information; useful follow-up observations that resolve material uncertainty. Prefer known protection need over hypothetical growth. Require a supported offering or explicitly provisional relevance path. No opportunity is a valid outcome.

Do not present CAP-MAP-03 cannibalization from text overlap alone, exact click depth from an incomplete site graph, true orphan status without independent inventory, traffic loss from absent GSC, or a broken website from a policy-limited render. When value is unavailable, use “potentially affects this offering” with an unknown benefit, not invented revenue ranges.

The first cycle's Act stage consists of governed observation and internal record creation; Verify checks evidence/claims; Measure tracks coverage and assessment quality; Learn records reviewed corrections for future retrieval. It does not demonstrate causal search growth, deploy a learning release or grant Auto.

## 7. Acceptance fixtures and failure traces

| Fixture / trigger | Required observable result |
| --- | --- |
| Static local-service site | Field-level provisional Twin, service-page graph, technical baseline and honest missing search/business data |
| SSR marketing site | Raw essentials retained; harmless client enhancement is not a defect |
| SPA with hydration failure | Matched DOM/raw evidence and qualified accessibility concern, not “Google cannot index” |
| ISR/cache mismatch | Time/context-specific inconsistency and request for refresh, no asserted framework root cause |
| Catalog with variants/facets | Distinct URL identities preserved; capped sampling; no parameter-wide consolidation |
| WordPress/Shopify/headless/custom fixtures | Findings based on response behavior; missing fingerprint does not block analysis |
| AI-generated mock site | Detect actual placeholder links/unsupported claims; never infer authorship from writing style |
| Sitemap-only page | Discovery provenance retained; orphan candidacy depends on independently sufficient link coverage |
| Partial crawl/render timeout | Counts reconcile; every affected assertion displays coverage limits |
| Injection/private redirect | No policy change, data exfiltration or forbidden fetch; incident recorded |
| Disconnected GSC/analytics | Unknown index/rank/traffic/revenue; no numeric zero substitutes |
| Two tenants same URL | No cross-tenant artifacts, prompts, graph nodes, caches or result sharing |
| Worker crash and duplicate delivery | Resume without duplicate domain results; exact evidence/decision lineage preserved |
| Revocation during queued work | New dispatch and affected publication denied; independent re-evaluation required |
| Empty/blocked/error site | Useful limitation summary and next step; no invented Twin/offering/opportunity |
| Restart and later correction | Past decision reconstructs original inputs; current Twin updates through new revisions |

No application tests have been run; these are expected behaviors. Phase 3 must produce concrete synthetic artifacts and expected records, JSON/API/physical schemas, admission/error contracts and a traceable test plan before implementation. A mobile-first wire contract can be validated with static examples; this phase does not scaffold a client.
