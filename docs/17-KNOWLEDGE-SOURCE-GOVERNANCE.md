# 17 — Knowledge Source Governance

Status: proposed operational extension of [09](09-EVIDENCE-AND-TRUTH-MODEL.md). Primary sources below were accessed on **2026-09-14**; access is not an assertion that every linked feature is available to AIOS. No third-party reference becomes search-engine policy.

## 1. Source and revision contracts

A `KnowledgeSource` has stable ID, publisher, canonical URI, source class, authority scope, supported language, rights/use classification, refresh owner and monitoring method. Its immutable `KnowledgeSourceRevision` records captured bytes hash or permitted excerpt hash, retrieval outcome, retrieved-at, publisher effective/publication times when known, content locator, language, redirects, extraction version, license/retention terms, predecessor and review status. Unknown effective date stays unknown; it is not replaced by retrieval time.

A `KnowledgeRule` is a typed assertion extracted from one or more revisions: claim kind, platform/surface, entity/page scope, conditions, normative strength (`requirement`, `prohibition`, `recommendation`, `description`), valid interval, source locators and reviewer. Official best-practice recommendations do not automatically become platform requirements. AIOS may adopt a stricter internal guardrail, labeled `AIOS policy`, with its own reason and owner.

A `SourceDependency` binds a rule/revision to a skill, capability, belief or pending proposal. A `RefreshRun` records retrieval status, semantic comparison, affected dependency count, reviewer and resulting publication/revocation. Metadata-only changes do not count as substantive guidance changes. Repository references use commit hashes; branch names alone are not release pins.

## 2. Five evidence classes, claim-specific conflict handling

| Class | Appropriate use | Conflict handling / forbidden inference |
| --- | --- | --- |
| Normative official guidance | Applicable platform constraints and documented behavior | Resolve by platform, scope and effective revision. Preserve conflicts and block affected unsafe actions; cannot override bytes actually observed |
| First-party observed site/search data | What a server returned, provider reported or authorized owner confirmed | Preserve context, reporting limits and revisions. Customer confirmation governs business intent, not ranking facts |
| Experimental evidence | Scoped effects under a frozen design | Assess design validity/interference; cannot excuse policy violations or become a universal prior from one site |
| Reputable external research | Testable heuristics, methods and explanatory context | Require methods, sample/applicability and upstream lineage; corroboration is not independent when studies share data |
| Model inference/hypothesis | Classification, explanations and prospective plans | Must identify inputs, model/config, uncertainty and tests; cannot supply normative authority or fabricate source citations |

Example: a source says an engine can render JavaScript, but a scoped observation shows blank content. Retain both: one concerns platform capability, the other this capture. Example: a customer says a town is unserved, but public copy lists it. Treat the business constraint as controlling recommendations and retain the content conflict. Example: a tactic correlates with traffic growth but violates applicable policy. The evaluation does not grant permission.

Phase 2 follows the explicit request to avoid a universal truth score. This clarifies 00's terse hierarchy without changing the primacy of applicable official guidance and first-party evidence. Formal acceptance of the clarification remains recorded in 13/D01; neither a new document nor a merge silently accepts every technology proposal.

## 3. Refresh and publication protocol

1. Register a source only after publisher/authority/rights review. Separate global public knowledge from tenant artifacts; a public page fetched for one tenant is not automatically a global training source.
2. Retrieve with bounded network/parser limits. Detect redirects, access failures, unexpected publisher changes and empty extraction; retain last valid revision with `refresh_failed` status.
3. Compare content and extracted rules. Keep the old and candidate revisions; a model can propose a diff but cannot publish policy.
4. Traverse dependency edges. Classify impact as editorial, recommendation, eligibility/permission, prohibition, removal or unknown. Notify the responsible SEO reviewer, prioritizing safety-sensitive changes.
5. Review changed rules against scope; run affected skill fixtures and negative cases. Publish new immutable knowledge and skill releases only after approval. Critical unsafe releases can be revoked before replacement is ready.
6. Revalidate queued work and current conclusions. Preserve past decision manifests and attach invalidation/supersession notices. Re-extract observations only if extraction semantics changed, not to rewrite source history.
7. Record reviewer, source diff, tests and next check. Monitor the refresher itself through 21.

Initial replaceable AIOS service policy: check policy/indexing/eligibility sources daily, API/protocol references weekly and descriptive context monthly. Material source notifications trigger earlier checks. A missed check produces degraded freshness immediately; no new safety-sensitive execution after its declared `fresh_until`. Release owners set explicit max-age per rule and risk use before promotion; these cadences are not platform update guarantees. Historical interpretation can still cite old guidance as historical guidance.

Unretrievable Bing text below stays unverified, rather than being filled from an SEO blog. A supported connector must verify actual methods, permissions, quotas and coverage with its provider contract before activation. Third-party licensed datasets have equivalent rights, retention and methodology revision gates.

## 4. Primary-source register

All entries accessed 2026-09-14. Brief implications are limited to the linked material; the capability designs, thresholds and workflow choices are AIOS proposals. “Inspected” means readable public documentation, not a validated API integration. Hash-pinned snapshots and clause locators remain mandatory before executable release.

| Key | Source / class / retrieval | Narrow implication for this specification |
| --- | --- | --- |
| K01 | [Google canonical methods](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), official, inspected | Canonical declarations are signals; compare them without treating them as identity or adoption proof |
| K02 | [Google robots introduction](https://developers.google.com/search/docs/crawling-indexing/robots/intro), official, inspected | Crawl restriction and index exclusion are separate concepts |
| K03 | [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309), standard, inspected | Pin robots matching/fetch behavior and distinguish protocol rules from AIOS's more conservative collection limits |
| K04 | [Google robots meta/header controls](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag), official, inspected | Parse page and HTTP directives with applicable user-agent/context |
| K05 | [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), official, inspected | Crawling/rendering/indexing are distinct; collect direct-load and rendered evidence separately |
| K06 | [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), API documentation, inspected | Preserve dimensions, source periods, incomplete data and non-exhaustive rows |
| K07 | [URL Inspection API](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect), API documentation, inspected | Reported indexed-version information is not a live test; use supported read scopes |
| K08 | [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), official, inspected | Discovery formats and declared inventory require validation; sitemap membership is not indexing evidence |
| K09 | [Structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), official, inspected | Distinguish syntax, applicable feature requirements, content truth and actual rich-result display |
| K10 | [Web Vitals](https://web.dev/articles/vitals), primary technical documentation, inspected | LCP, INP and CLS concern different user-experience dimensions; separate field from lab methodology |
| K11 | [Business representation guidelines](https://support.google.com/business/answer/3038177), official, inspected | Actual business identity and service/premises eligibility constrain local recommendations |
| K12 | [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies), official, inspected | Assess actual prohibited behavior, including scaled-content/link manipulation; source-backed policy gates remain independent |
| K13 | [Title links](https://developers.google.com/search/docs/appearance/title-link) and [snippets](https://developers.google.com/search/docs/appearance/snippet), official, inspected | Accurate page metadata can inform appearance; the engine determines displayed text |
| K14 | [Helpful, reliable content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), official, inspected | Useful people-focused content and evidence need contextual review, not word-count scoring |
| K15 | [Image guidance](https://developers.google.com/search/docs/appearance/google-images) and [video guidance](https://developers.google.com/search/docs/appearance/video), official, inspected | Media discovery and contextual metadata require asset-specific evidence |
| K16 | [Ecommerce URL structure](https://developers.google.com/search/docs/specialty/ecommerce/designing-a-url-structure-for-ecommerce-sites), official, inspected | Product/variant/navigation identity deserves an explicit URL contract |
| K17 | [Localized page versions](https://developers.google.com/search/docs/specialty/international/localized-versions), official, inspected | Alternate-language relationships need scoped equivalent-page validation |
| K18 | [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a), official, **unverified text** | Retrieval returned a shell; alternate guidelines route also failed. Do not claim verified rule clauses or API parity |
| K19 | [IndexNow protocol](https://www.indexnow.org/documentation), official protocol, inspected | Host/key validation and response receipts are separate from downstream indexing |
| K20 | [Google AI features](https://developers.google.com/search/docs/appearance/ai-features), official, inspected | Ordinary search foundations remain relevant; do not invent guaranteed AI inclusion via special markup/files |
| K21 | [Karpathy AutoResearch](https://github.com/karpathy/autoresearch), author reference, inspected | Bounded experiments and fixed evaluator are mechanism references only; detailed disposition in 22 |
| K22 | [Nate Herk AIS-OS](https://github.com/nateherkai/AIS-OS), author reference, inspected | Context/routing/audit/visualization mechanisms are design references, not search policy; 22 |

No patient records, financial guidance, or legal advice is required to classify a regulated business. Such archetypes activate provenance and qualified-review constraints, not autonomous domain advice. Feature-specific healthcare, travel, education, product feed, structured-data type and regional requirements require separate current-source research before those skills are released.

## 5. Acceptance fixtures

Required cases: changed prohibition revokes dependent queued work; unchanged source hash causes no release; changed extraction parser creates a new derivation; removed/unreachable page remains unknown; official recommendation is not mislabeled mandatory; old experiment cannot override current policy; copied research is not independent evidence; translated guidance conflict is retained; future-effective rule is not applied to past facts; tenant-private case cannot enter global knowledge. No fixture has been implemented in Phase 2.
