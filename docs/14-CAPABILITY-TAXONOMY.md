# 14 — Capability Taxonomy

Status: complete Phase 2 domain inventory; executable release status is **unreleased for every row**. These responsibilities extend the 32 families in 02; they do not create 36 separate products. Counts and floor coverage are reconciled in [23](23-PHASE-2-GAP-REVIEW.md).

## Reading and contract rules

Each numbered row is one meaningful capability. Its definition inherits the universal schema/profiles in [15](15-CAPABILITY-CONTRACT.md) and archetype rules in [18](18-BUSINESS-ARCHETYPE-MATRIX.md). Domain headers supply purpose, applicability, optional evidence, freshness and concentration of risk. Row columns supply minimum evidence, detection/diagnosis and uncertainty, a permitted recommendation, and verification/measurement. A semicolon in the final column separates candidate response from its check. These are semantic contracts; exact executable schemas, source snapshots and test datasets are release gates in 16.

The explicit minimum evidence is required to reach the row's stated conclusion; absent evidence returns `cannot_assess`. All rows permit investigation and internal assessment recording, **no external mutation**. Candidate responses describe future governed interventions. Required sensors are those producing named row evidence; domain enrichments are optional. Domain owner is the corresponding SEO domain lead; security/evaluation own release constraints. Normative source keys resolve in [17](17-KNOWLEDGE-SOURCE-GOVERNANCE.md); a source family marked `release research` is a known release dependency, not an asserted rule. Platform claims below are limited to those sources. Design heuristics and proposed diagnostics are AIOS engineering recommendations.

Each diagnosis names a counterexample that can produce a false positive or hide a false negative. “No finding” always means within declared coverage. Measurement signals are operational or observational unless a frozen experiment supports attribution. Every row requires a business-relevance path through the Twin; apparently easy keywords without that path cannot receive a growth recommendation.

## BUS — Business and archetype understanding

Profile P+R, CONTEXT. All sites; build a provisional Twin to direct effort toward real offerings and constraints. Optional customer confirmation, analytics and catalog records. Business statements outrank page inference for business intent, not search behavior. Risk: false claims about services, identity or regulated expertise.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-BUS-01 Business identity resolution | Home/about/contact locators → candidate business/site relationship | Similar brand names, franchises and agency footers are not common ownership | Ask only about material ambiguity; entity collision and correction rate |
| CAP-BUS-02 Archetype classification | Offering and transaction-path observations → multi-label archetype | Blog presence does not make a SaaS business a publisher; hybrid labels coexist | Activate scoped profiles; expert agreement by archetype |
| CAP-BUS-03 Offering inventory | Service/product descriptions → offering claims | Navigation labels can be aspirational; distinguish available, planned and discontinued | Confirm important gaps; offering evidence coverage |
| CAP-BUS-04 Geography and service boundaries | Address/service statements with context → location/service-area claims | Registered address is not customer-facing premises or coverage radius | Request boundary clarification; unsupported area inference rate |
| CAP-BUS-05 Conversion and value model | Observed contact/checkout/signup paths → candidate goals | A visible form is not a working or measured conversion; no submission test | Recommend measurement connection; goal-source completeness |
| CAP-BUS-06 Constraints and protected wins | Confirmed constraints or performance evidence → protected asset/constraint records | Without analytics asset value is unknown, not low | Reserve assets from speculative change; constraint violations and owner corrections |

## AUD — Customers, journeys and intent

Profile R with public content; CONTEXT plus PERIOD for demand. All archetypes. Optional interviews, consented aggregate sales themes and comparable SERPs. Purpose: relate search tasks to qualified customers. Avoid importing private individual profiles or treating a model persona as a customer fact.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-AUD-01 Customer/problem inference | Offering claims and page examples → audience/problem hypotheses | Testimonials are a selected sample, not population demographics | Validate important segments; confirmed versus inferred share |
| CAP-AUD-02 Journey mapping | Landing paths and problem/decision content → journey-stage map | Visitors may enter at any stage; page sequence does not prove a funnel | Investigate missing decision support; path evidence and unresolved stages |
| CAP-AUD-03 Query intent classification | Query text, language and contextual evidence → intent distribution | One query may mix purchase, support and research; SERP is optional corroboration | Preserve mixed intent; labeled-set confusion by locale |
| CAP-AUD-04 Qualification and exclusion | Confirmed offerings/service constraints → relevant/excluded intent | Popular demand may be outside capacity, region or ethical scope | Exclude vanity targets with reasons; relevance correction rate |
| CAP-AUD-05 Decision-friction diagnosis | Observed landing content and next-step affordance → friction hypotheses | Missing price may be intentional for custom services; do not invent lost leads | Recommend a business review; observed task clarity and later qualified outcomes |

## DEM — Demand and keyword intelligence

Profile C+R, PERIOD. All search-facing pages; purpose is demand worth serving, not raw keyword totals. Optional first-party query logs and seasonal business records. Required external estimates need licensed acquisition and context. Risk: purchased metrics presented as population truth. Sources K06; vendor contracts require release research.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-DEM-01 Seed discovery | Offering/problem/entity evidence → candidate query seeds | Generated phrases establish neither actual searches nor volume | Request demand observation; seed relevance and provenance |
| CAP-DEM-02 Observed keyword discovery | Scoped query dataset/window → observed query inventory | Truncated provider rows cannot establish exhaustive demand | Expand justified sampling; coverage and unique observed queries |
| CAP-DEM-03 Volume and seasonality estimates | Licensed volumes with locale/period/method → ranges and seasonal patterns | Rounded volumes and seasonal spikes distort averages | Compare like periods; source revision and forecast error |
| CAP-DEM-04 Keyword clustering | Query set plus versioned lexical/semantic/context criteria → clusters | Similar wording may conceal different intent; split across locales | Review uncertain boundaries; pairwise labeled precision/recall |
| CAP-DEM-05 Topic/entity modeling | Text locators and ontology → topics/entities/relations | Entity mentions are not demonstrated expertise; disambiguate homonyms | Investigate coverage gaps; entity-resolution errors |
| CAP-DEM-06 Emerging and declining demand | Comparable repeated demand observations → change candidates | Provider methodology changes can masquerade as a trend | Separate source change from demand shift; revised-series stability |

## MAP — Query, page and overlap reasoning

Profile R, LIVE+PERIOD. All eligible landing pages; optional GSC and SERPs. Purpose: give each relevant intent a defensible destination. Risk concentrates in consolidation of winning pages; K01/K06, relevance heuristics remain hypotheses.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-MAP-01 Page type classification | Raw/rendered page evidence → page-type distribution | Template appearance can hide a product, service or support purpose | Preserve uncertain types; per-type labeled accuracy |
| CAP-MAP-02 Query-to-page alignment | Query intent and page claims → candidate mappings | Without query performance mappings are inferred, not rankings | Recommend intended landing association; reviewed intent fit |
| CAP-MAP-03 Cannibalization diagnosis | Overlap plus comparable query/page performance → competition hypothesis | Multiple visible pages can be useful sitelinks or distinct intents | Investigate substitution before consolidation; stable query-page switches and value |
| CAP-MAP-04 Unserved intent gaps | Relevant intent set and scoped inventory → no observed destination | Partial crawl can conceal a page; “gap” is bounded by inventory | Request inventory enrichment; confirmed gap precision |
| CAP-MAP-05 Portfolio redundancy | Page clusters and differentiated business purpose → overlap candidates | Templates/variants/local branches may intentionally repeat text | Propose distinct roles or reviewed merge; retained intent and protected value |

## TER — Territory and opportunity strategy

Profile R, CONTEXT+PERIOD. All archetypes using their activation model; optional costs, margins and delivery capacity. Purpose: allocate scarce attention toward qualified growth while protecting current value. No SEO difficulty number is feasibility proof.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-TER-01 Territory assessment | Contextual visibility, relevance and period → owned/contested/opportunity/expansion/unviable assessment | Without visibility evidence territory is unknown; no exclusive ownership claim | Reassess on expiry; classification stability and coverage |
| CAP-TER-02 Feasibility assessment | Demand, competing assets, site capability and costs → benefit/cost ranges | Authority proxies and competitor budgets are uncertain | Stage prerequisites before expansion; estimate calibration |
| CAP-TER-03 Geographic expansion | Confirmed ability to serve plus local demand → scoped expansion hypothesis | Nearby queries do not authorize invented locations or doorway pages | Validate service capacity; relevant area evidence and qualified enquiries |
| CAP-TER-04 Opportunity prioritization | Alternatives, relevance, risk and budget → ranked constrained portfolio | Overlapping benefits cannot be summed independently | Select/defer with rationale; business relevance and forecast error |
| CAP-TER-05 Strategy dependency planning | Selected opportunities and protected constraints → versioned plan DAG | Competing agents cannot activate incompatible asset plans | Sequence investigations and actions; dependency conflicts and stale-plan rate |

## CRW — Crawl discovery and resource allocation

Profile P, LIVE; all public sites, including very large inventories. Optional authorized server logs/CMS exports. Purpose: acquire representative evidence without overwhelming the site. K02/K03/K08. Risk: network access, crawl traps, expensive or unintended endpoints.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-CRW-01 Scoped discovery | Validated seed, robots policy, links/sitemaps → frontier with discovery provenance | Origin aliases and offsite links do not grant broader scope | Admit bounded public URLs; accepted/rejected reasons |
| CAP-CRW-02 Crawl prioritization | Frontier, page role, change history and budget → scheduled order | Important unseen pages cannot be inferred from link popularity alone | Reserve coverage across templates; useful pages per fetch and starvation |
| CAP-CRW-03 Trap and duplicate-work control | URL patterns, response fingerprints and frontier growth → trap candidates | Many valid products resemble facets; avoid global pattern exclusions | Pause suspect expansion; excluded valid-page review and budget use |
| CAP-CRW-04 Coverage reconciliation | Discovered/admitted/visited/failed/excluded sets → explicit coverage | No percentage of the whole unknown site; only a defined denominator | Report partial inventories; frontier accounting equality |
| CAP-CRW-05 Verified crawler-log analysis | Authorized redacted logs and verified bot identity → crawl activity | User-agent text alone can be spoofed; absent logs are unknown | Correlate activity with important URLs; verified hit coverage by interval |
| CAP-CRW-06 Refresh allocation | Prior artifacts and observed changes → re-observation schedule | Unchanged home page does not prove unchanged deep pages | Sample stable and changed groups; missed-change and freshness rates |

## ROB — Crawl and indexing directives

Profile P+R, LIVE+RULE. HTML and non-HTML resources; K02/K03/K04. Purpose: distinguish collection permission, index exclusion and display controls. Future template or robots edits are high blast radius; they are never ordinary low-risk metadata changes.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-ROB-01 robots.txt evaluation | Fetched robots bytes/status, origin, agent and URL → applicable crawl decision | A fetch error differs from no rules; our crawler and platform agent differ | Explain blocked coverage; rule-match fixture agreement |
| CAP-ROB-02 Meta robots analysis | Parseable raw/rendered directive locators → per-agent directives | Blocked crawling may prevent a platform seeing noindex; missing HTML is not absent directive | Investigate unintended exclusions; raw/render rule consistency |
| CAP-ROB-03 X-Robots-Tag analysis | Response headers per hop/content type → header directives | PDF/image directives are not discoverable from HTML alone | Recommend scoped correction; header parser and inheritance checks |
| CAP-ROB-04 Directive conflict resolution | All available relevant directives and platform rules → conflict assessment | Contradictory sources or unknown effective rules cannot be guessed away | Escalate relevant conflict; explicitly evaluated precedence fixtures |
| CAP-ROB-05 Snippet and preview controls | Applicable tags/attributes and visible content → preview constraints | Display controls do not guarantee a particular snippet or citation | Review intended exposure; parsed constraints and optional observed appearance |

## SMP — Sitemap and feed discovery

Profile P, LIVE+RULE. All sites exposing discovery feeds; optional CMS catalog. K08; extension-specific release research. Purpose: reconcile intended discoverable inventory, not treat a submitted list as indexed content.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-SMP-01 Sitemap parsing | XML/text/index artifacts and parser version → URL membership | Malformed or oversized documents create partial coverage, not empty lists | Request regeneration review; parsed versus rejected entries |
| CAP-SMP-02 Membership consistency | Sitemap URLs plus response/canonical/indexability observations → discrepancies | Time-varying inventory can explain mismatch; absence alone is not an error | Align intended discovery set; confirmed inconsistent members |
| CAP-SMP-03 Freshness credibility | Lastmod declarations and repeated content fingerprints → reliability assessment | Template timestamps may change without meaningful page changes | Recommend truthful update logic; lastmod versus observed change agreement |
| CAP-SMP-04 Specialized feed reconciliation | News/video/image/localized feed fields and corresponding pages → extension findings | Eligibility depends on current surface rules, not just XML validity | Review supported extension usage; field/content agreement and source version |

## HTTP — Delivery and status behavior

Profile P, LIVE. All URL types; optional CDN/server records. Purpose: distinguish delivery failure from content failure. K03 and HTTP standard contracts require release research. Future infrastructure changes require Expert Review.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-HTTP-01 Status and availability | Timestamped request/response/hops → delivery observations | Temporary edge errors, bot protection and locale variation need distinct contexts | Repeat bounded observation; status distribution and persistence |
| CAP-HTTP-02 Redirect semantics | Source/target/status and intent → redirect assessment | Legitimate login or localization redirects are not migrations | Review target relevance; final destination and method behavior |
| CAP-HTTP-03 Chains and loops | Complete visited hop sequence → path/loop findings | Budget-limited chain is incomplete, not proven infinite loop | Recommend direct relevant target; independent hop traversal |
| CAP-HTTP-04 Soft-404 candidates | Successful status plus missing/empty-content evidence → candidate failure | Short valid answers and out-of-stock pages are not automatically soft 404s | Seek provider/owner corroboration; labeled precision and index signal if connected |
| CAP-HTTP-05 Cache and variant consistency | Matched repeated headers/content by context → inconsistent representation | Personalized/geographic variants may be intentional; preserve Vary/context | Investigate stale edge representation; repeat mismatch frequency |

## URL — Identity, canonicalization and duplication

Profile P+R, LIVE; all URLs, optional CMS IDs/Inspection. K01. Purpose: preserve identity while diagnosing competing representations. Scope includes HTTP canonical headers and meaningful parameters. No destructive merge based on similarity.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-URL-01 Conservative normalization | Original URL and versioned normalization rules → lookup key | Case, encoded paths and query order may be semantically meaningful | Retain aliases separately; round-trip and collision fixtures |
| CAP-URL-02 Canonical signal consistency | Observed declarations/sitemap/redirect signals → disagreement claims | Declared and engine-selected canonicals differ; noncontemporaneous signals may be stale | Investigate representative intent; independent resolution check (15) |
| CAP-URL-03 Duplicate content grouping | Body fingerprints plus locale/variant identity → duplicate candidates | Boilerplate overlap or translations do not justify merging pages | Review distinct purpose; labeled duplicate precision |
| CAP-URL-04 Parameter and variant identity | Parameterized responses and product/context evidence → identity relationships | Filters can encode useful distinct demand; never strip every query string | Propose scoped normalization; preserved valid variant retrieval |
| CAP-URL-05 Canonical target eligibility | Declared target plus response/directive/content evidence → target problems | Unobserved target eligibility is unknown; alternate language may be intentional | Investigate broken/ineligible target; target fetch and declared-context check |

## IDX — Indexability and index coverage

Profile P+C+R, LIVE+PERIOD. Search-intended URLs; optional verified logs. K02/K04/K07. Purpose: separate eligibility, observed crawling, provider index state and actual appearance.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-IDX-01 Technical eligibility | Response, directives and content-access observations → eligibility assessment | Eligible does not imply indexed; absent signals are unknown on blocked pages | Investigate blockers; rule-based fixture agreement |
| CAP-IDX-02 Provider index state | Authorized per-URL inspection with provider observation time → reported state | Stored provider data is not a live crawl or exhaustive site inventory | Refresh supported observations; age and inspected-set coverage |
| CAP-IDX-03 Crawl/index discrepancy | Same-scope crawl and provider history → discrepancy hypotheses | Collection times and canonical identities can explain disagreement | Request distinguishing refresh; resolved versus unexplained discrepancies |
| CAP-IDX-04 Exclusion cohort analysis | Comparable exclusion observations and page classes → cohort explanations | Similar provider labels can have different causes; no automatic mass fix | Investigate representative samples; sampled explanation accuracy |
| CAP-IDX-05 Adoption latency tracking | Known publish/change time plus repeated provider observations → censored time-to-adoption | No observation does not mean never indexed; provider delays matter | Continue bounded monitoring; observed versus censored latency |

## JS — Rendering and modern website behavior

Profile P, LIVE+RULE. React/Next.js/Nuxt/SPA/SSR/SSG/ISR, WordPress, Shopify and headless/custom sites, based on observed behavior rather than brand assumptions. K05. Purpose: find content/metadata/navigation unavailable under observed render conditions. Sandbox and network limits are mandatory; optional authorized build/deployment metadata.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-JS-01 Technology and render-mode inference | Markers, initial document and resource patterns → technology hypotheses | Markers can be removed or stale; never claim exact framework/version from one signature | Use behavior-based tests; labeled classification confidence |
| CAP-JS-02 Raw/rendered parity | Matched raw HTML and timed DOM captures → content/metadata/link differences | Added content is not inherently a defect; compare business-critical content | Investigate missing essentials; reproducible delta locators |
| CAP-JS-03 Hydration stability | DOM timeline and console/network failures → instability findings | Third-party console errors may be irrelevant; static content can remain usable | Recommend focused repair; repeated critical-content stability |
| CAP-JS-04 Client navigation discoverability | Anchor targets plus direct-load observations → reachable route map | Click handlers or router-only state may hide routes; avoid interaction with mutation controls | Recommend real discoverable destinations; direct-load/link coverage |
| CAP-JS-05 Dynamic metadata consistency | Initial and later title/canonical/robots values → competing metadata | Incomplete render cannot prove final metadata; context-dependent titles may be valid | Diagnose timing/duplication; repeated settled metadata agreement |
| CAP-JS-06 Blocked resource impact | Failed resource requests plus missing DOM dependency → impact hypothesis | An analytics block does not explain missing main content | Isolate required resources; critical versus incidental failures |
| CAP-JS-07 SSR/SSG/ISR freshness | Comparable route snapshots/headers over time → stale/fallback hypotheses | Public observations cannot prove server build strategy | Recommend cache/revalidation investigation; route parity and freshness |
| CAP-JS-08 Generated-site integrity | Page evidence, links, claims and reuse patterns → concrete integrity findings | AI authorship cannot be proven from style; assess placeholders, fake claims and broken flows | Request factual repair; verified fabricated/placeholder findings, no AI detector score |

## IA — Information architecture

Profile P+R, LIVE. All sites; optional catalog/export/analytics. Purpose: connect relevant offerings to discoverable page structures. K05 for link discovery; hierarchy heuristics require validation. Future navigation/template changes carry cluster/site risk.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-IA-01 Taxonomy coherence | Page types, category membership and offerings → taxonomy map | URL folders do not necessarily express business hierarchy | Propose clearer relationships; classified membership consistency |
| CAP-IA-02 Navigation coverage | Observed menus/footer/context links and target roles → coverage gaps | Mobile and desktop navigation differ; hidden unloaded menus are unknown | Investigate missing important routes; reachable role coverage |
| CAP-IA-03 Breadcrumb consistency | Visible/structured breadcrumb paths and destinations → path conflicts | Multiple valid hierarchies can exist for one product | Align actual navigation; path validity and consistency |
| CAP-IA-04 Click-depth assessment | Seed-scoped link graph → shortest observed paths | Partial graph only gives observed paths, not exact sitewide depth | Recommend access to important pages; path changes within fixed crawl scope |
| CAP-IA-05 Orphan candidate detection | Independent inventory plus observed link graph → unlinked candidates | A link-only crawl cannot discover true orphans; absence in partial graph is provisional | Reconcile inventory before linking; confirmed orphan rate |

## LNK — Internal linking and authority allocation

Profile P+R, LIVE. All content networks; optional query/conversion data. Purpose: help users and crawlers reach relevant assets. K01/K05 for link/canonical facts. Graph centrality is an internal model, not a search-engine authority measurement.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-LNK-01 Internal edge extraction | Link locators, target resolution, rel and placement → observed edges | Render-only or gated links may be unobserved | Preserve typed edges; parser accuracy and raw/render coverage |
| CAP-LNK-02 Flow modeling | Scoped graph and declared algorithm → modeled importance | Missing edges and arbitrary damping distort apparent authority | Compare scenarios; sensitivity and graph completeness |
| CAP-LNK-03 Contextual link opportunities | Source passage, target intent and business relevance → link candidates | Similar topics do not guarantee useful reader transition | Recommend editorial links; reviewed contextual usefulness |
| CAP-LNK-04 Anchor interpretation | Anchor text/context and target purpose → ambiguous/misleading anchors | Brand/short anchors may be appropriate; no fixed exact-match quota | Clarify misleading anchors; destination expectation agreement |
| CAP-LNK-05 Broken and redirected internal links | Link edge plus resolved response path → defects | Temporary outage should not trigger permanent deletion | Recommend destination repair; independent destination check |

## PAGE — On-page relevance and appearance

Profile P+R, LIVE; optional comparable SERPs/GSC. All landing pages; purpose: accurately communicate relevant offerings. K13 for title/snippet guidance at release; no rigid character-count or keyword-density ranking rules.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-PAGE-01 Title relevance | Title, page intent and offering evidence → title diagnosis | Repeated brand text is not automatic duplication harm | Recommend accurate differentiated title; source fit and later appearance if observed |
| CAP-PAGE-02 Description usefulness | Description and actual page claims → description assessment | Missing description need not prevent useful engine-generated text | Propose truthful summary; unsupported-claim count |
| CAP-PAGE-03 Heading structure | Heading hierarchy and content sections → clarity issues | Multiple H1s alone do not prove ranking harm | Improve navigable meaning; task comprehension and heading/content fit |
| CAP-PAGE-04 Intent fulfillment | Declared page role, relevant intent and content → alignment gaps | Longer content is not automatically better; support intent differs from sales | Investigate unmet task; reviewed task-completion rubric |
| CAP-PAGE-05 Observed snippet divergence | Contextual SERP snippet plus page revision → appearance difference | Rewrite can be query-dependent and beneficial | Assess accuracy before changing; comparable appearance observations |

## CNT — Content value and lifecycle

Profile P+R, LIVE+CONTEXT; PERIOD for decay. All editorial/commercial pages; optional author records, original research and outcome data. Purpose: useful truthful decision support. K12/K14; source-specific rubrics before release. Regulated assertions and deletion have elevated risk.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-CNT-01 Semantic coverage | Relevant task/questions and page evidence → missing-topic hypotheses | Competitor word counts do not define necessary coverage | Propose useful missing answers; expert rubric and unsupported topic rate |
| CAP-CNT-02 Usefulness assessment | Intended user task and page content → rubric-based usefulness | A short direct answer may outperform exhaustive prose | Recommend focused improvement; blinded task usefulness ratings |
| CAP-CNT-03 Originality and duplication attribution | Similar passages with provenance → reuse findings | Licensed/syndicated/legal boilerplate is not automatically abuse | Investigate rights and value; matched passage review |
| CAP-CNT-04 Experience and evidence support | Claims, citations and author/experience records → support gaps | Biography assertions are not independent proof; never invent experience | Request substantiation; claim-to-evidence coverage |
| CAP-CNT-05 Completeness and accuracy | Offering facts, current sources and page statements → contradictions/omissions | Source disagreement may reflect different dates or populations | Recommend fact review; independently confirmed correction rate |
| CAP-CNT-06 Freshness triage | Material claim age and current authoritative inputs → refresh priorities | A changed timestamp is not a substantive update | Refresh affected claims; expired material-claim share |
| CAP-CNT-07 Content decay diagnosis | Comparable historical performance and changes → decay hypotheses | Demand decline, measurement changes and competitors can explain losses | Separate causes before revision; cohort trends and confounders |
| CAP-CNT-08 Consolidation planning | Overlap, differentiated intent, links and protected value → merge alternatives | Similar pages may serve different markets; absent performance cannot imply dispensable | Compare keep/differentiate/merge; retained coverage and recoverability |
| CAP-CNT-09 Pruning risk analysis | Inventory, purpose, links and value evidence → removal risk | Low reported traffic may be privacy-filtered or unmeasured | Defer deletion under uncertainty; protected-asset and redirect-plan coverage |

## SD — Structured data and entity identity

Profile P+R, LIVE+RULE. Pages with supported entity/feature types; optional catalog and provider reports. K09. Purpose: make truthful page meaning machine-readable. Syntax, applicable eligibility and actual appearance are separate; template edits affect many entities.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-SD-01 Syntax and extraction | JSON-LD/microdata/RDFa locators → parsed graphs/errors | Valid JSON can still use unsupported vocabulary or wrong values | Recommend parser repair; independent parse agreement |
| CAP-SD-02 Feature eligibility | Entity type, page purpose and current platform requirements → eligibility assessment | Schema vocabulary existence does not mean a search feature supports it | Recommend supported truthful markup; rule-version fixture agreement |
| CAP-SD-03 Entity-ID consistency | IDs, references and business identity evidence → identity conflicts | Shared names do not identify the same organization or product | Propose stable scoped IDs; dangling/colliding reference count |
| CAP-SD-04 Content/markup agreement | Visible claims and corresponding markup values → contradictions | Dynamic prices/availability need matched time and variant | Align source data; value agreement at same revision |
| CAP-SD-05 Rich-result verification | Validator output and optional observed appearance → separate validity/appearance states | Passing validation cannot guarantee rich results | Monitor eligible pages; validation coverage and observed appearance separately |

## MED — Image, video and document discovery

Profile P+R, LIVE+RULE. Media-bearing and non-HTML pages; optional asset catalog and rights records. Purpose: expose useful media with honest context. K15; document-format rules need release research. Download budgets and rights apply.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-MED-01 Image discoverability | Image URLs, loading attributes, responses and rendered visibility → access findings | Lazy-loaded or decorative images require different judgments | Improve useful image delivery; permitted fetch/render availability |
| CAP-MED-02 Image meaning and alternatives | Image context, alt text and page purpose → semantic/accessibility findings | Decorative images can correctly have empty alternatives; no keyword stuffing | Recommend accurate alternatives; human image/task agreement |
| CAP-MED-03 Video discovery and context | Watch-page evidence, player/source/thumbnail locators → discovery assessment | Embedded video need not be the main page purpose; gated player may be untestable | Clarify primary media context; matched player/thumbnail access |
| CAP-MED-04 Video metadata consistency | Visible video facts, markup/feed and timing → conflicting metadata | Reused thumbnails or changed duration can reflect revisions | Align records; cross-source agreement |
| CAP-MED-05 Non-HTML search assets | PDF/document response, text availability, headers and inbound links → asset findings | A PDF may be the best intended resource; do not convert indiscriminately | Recommend accessible discovery/metadata; extraction coverage and target integrity |

## PERF — Performance and mobile experience

Profile P+C+R, LIVE for lab and PERIOD for field. All pages, segmented by device/template. Optional consented real-user telemetry. K10. Purpose: diagnose user friction while separating field populations from controlled lab observations. No performance metric guarantees growth.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-PERF-01 Field/lab baseline | Measurement method, device/network, URL/origin grain and window → comparable baseline | Origin aggregates cannot stand in for each URL; lab is not field | Request missing coverage; metric provenance and repeated-run variance |
| CAP-PERF-02 LCP diagnosis | Load trace and largest-content element timing → bottleneck hypothesis | Single-run network noise can dominate; hero choice varies by viewport | Investigate resource/render delay; comparable LCP distribution |
| CAP-PERF-03 INP diagnosis | Suitable interaction timing evidence → responsiveness finding | Noninteractive page load cannot measure real interaction responsiveness | Request field or safe controlled interaction evidence; interaction cohort distribution |
| CAP-PERF-04 CLS diagnosis | Layout-shift trace and element attribution → instability cause | User-triggered changes and late loading need method-specific treatment | Stabilize affected layout; comparable shift attribution |
| CAP-PERF-05 TTFB/delivery latency | Navigation timing by cache/region/request context → delivery delay | Server, redirect and network components differ; TTFB is not a Core Web Vital | Investigate measured component; latency distribution by context |
| CAP-PERF-06 Mobile parity and usability | Matched mobile/desktop content, links, viewport and layout → parity/friction findings | Responsive design may intentionally rearrange content | Preserve essential task access; content parity and accessibility review |

## LOC — Local presence and multi-location search

Profile P+C+R, CONTEXT+PERIOD. Physical, service-area and multi-location businesses; optional authorized Business Profile and licensed local observations. K11. Purpose: represent real service availability. Public inference never verifies premises or authorizes profile edits.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-LOC-01 Local entity reconciliation | Site/location facts and observed profile identifiers → candidate mappings | Practitioners, departments and franchises can be distinct entities | Confirm material ambiguity; entity matching precision |
| CAP-LOC-02 Maps/local visibility | Licensed/local provider observations with query/coordinate/time → visibility samples | One coordinate cannot represent a city; personalization limits claims | Sample justified service areas; contextual observation coverage |
| CAP-LOC-03 Identity consistency | Name/address/contact/hours observations with dates → discrepancies | Tracking numbers and legitimate aliases are not automatically defects | Investigate customer confusion; confirmed inconsistent fields |
| CAP-LOC-04 Review/reputation themes | Permitted reviews with source/date and aggregate analysis → themes | Selection, spam and platform moderation bias samples | Recommend service/content response themes; supported theme prevalence, no fake reviews |
| CAP-LOC-05 Citation reconciliation | Licensed directory records and confirmed business identity → citation gaps/conflicts | Directory counts alone do not establish value | Prioritize relevant corrections; verified identity agreement |
| CAP-LOC-06 Service-area strategy | Confirmed served areas, capacity and relevant demand → coverage plan | Nearby town names do not establish a physical branch | Recommend distinct useful service information; confirmed area/task coverage |
| CAP-LOC-07 Location portfolio governance | Location IDs, lifecycle/hours and page/profile mappings → portfolio anomalies | Temporary closures differ from permanently closed branches | Review scoped lifecycle updates; page/profile/real-world alignment |

## COM — Ecommerce, D2C and marketplace supply

Profile P+C+R, LIVE+PERIOD. Product/category/offer/listing pages; optional catalog, merchant feeds and inventory. K16; commerce adapter rules require release research. Purpose: attract useful purchase intent without misrepresenting stock or price. Catalog/template changes have broad impact.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-COM-01 Product representation | Product facts, visible offer and page role → product completeness | Manufacturer reuse is not automatically abuse; variant facts may differ | Recommend accurate decision support; catalog/page agreement |
| CAP-COM-02 Category demand alignment | Category inventory, relevance and demand context → category opportunities | Empty or narrow categories may be seasonal; volume alone is insufficient | Evaluate viable landing categories; useful assortment and intent fit |
| CAP-COM-03 Variant identity | Parent/variant identifiers, URLs, canonicals and attributes → variant map | Distinct variants can deserve separate representation | Propose identity-safe mapping; retained attribute/offer accuracy |
| CAP-COM-04 Faceted navigation control | Filter patterns, response samples and useful demand → crawl-space model | Some facets are valuable landing pages; blanket blocking can lose demand | Partition useful versus combinatorial states; sampled valid-page preservation |
| CAP-COM-05 Availability lifecycle | Stock/discontinued facts, page state and substitutes → lifecycle options | Temporarily out-of-stock is not permanently unavailable | Compare retain/substitute/retire; truthful availability and relevant recovery |
| CAP-COM-06 Merchant/search-commerce consistency | Authorized feed/status and page/markup offers → discrepancies | Feed processing delays can explain short-lived mismatch | Recommend source alignment; same-variant price/stock agreement |
| CAP-COM-07 Pagination and listing discovery | Series links, loaded items and direct URLs → discovery coverage | Infinite scroll may work for users while obscuring deeper items | Recommend discoverable series; unique items reachable within declared scope |
| CAP-COM-08 Marketplace quality boundaries | Listing ownership, duplicates, trust evidence and supply rules → moderation/search risks | Seller assertions are unverified; useful near-duplicate listings may coexist | Route substantiation/moderation review; confirmed false claims and supply coverage |

## INT — International and multilingual search

Profile P+R, LIVE+RULE. Locale variants, international businesses and cross-site portfolios. Optional confirmed market strategy and native-language review. K17. Purpose: serve correct language/region intent without destructive identity assumptions.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-INT-01 Locale identity | Language/content/URL/market evidence → locale hypotheses | A language does not establish a served country | Confirm market scope; language/market classification errors |
| CAP-INT-02 Hreflang cluster validation | Alternate annotations, reciprocal references and canonical contexts → cluster issues | Partial crawling can hide return links; annotations are not ranking guarantees | Review equivalent-page clusters; observed reciprocity and valid targets |
| CAP-INT-03 Translation and intent parity | Equivalent page claims and native-language intent → mismatches | Literal translation can miss local terminology; length differences are harmless | Recommend localized task support; native-review agreement |
| CAP-INT-04 Locale routing behavior | Matched direct-load observations across language/region settings → routing findings | IP/browser routing may conceal accessible alternates | Preserve explicit locale access; reachable equivalent URLs |
| CAP-INT-05 Cross-market portfolio conflicts | Confirmed markets, offerings and overlapping locale pages → competing-role diagnosis | Same-language pages may serve distinct legal/commerce contexts | Clarify roles before consolidation; preserved market-specific facts |

## AUTH — Links, mentions and authority evidence

Profile C+R, PERIOD; public verification P optional. All businesses with external visibility. Licensed link/mention datasets and permitted source fetches; K12. Purpose: reason about relevant discoverability/reputation, not purchase a score. Never infer a Google penalty from a vendor toxicity label.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-AUTH-01 Backlink inventory | Dated source/target/placement/rel observations → link inventory | Provider discovery is incomplete; “first seen” is not creation time | Reconcile important links; observed-source coverage |
| CAP-AUTH-02 Referring-domain quality | Source relevance, editorial context and observable integrity → quality hypotheses | Domain metric or unfamiliar TLD alone is not quality proof | Review high-value/risk sources; expert calibration |
| CAP-AUTH-03 Topical link relevance | Source passage and target offering/intent → relevance assessment | A broad publication may have a relevant individual article | Prioritize useful relationships; passage-level relevance accuracy |
| CAP-AUTH-04 Anchor distribution | Comparable observed links and anchor classes → distribution | Brand popularity or syndication can explain skew; sample bias remains | Investigate anomalies; denominators and source diversity |
| CAP-AUTH-05 Lost-link recovery | Prior/current source observations and target state → lost candidates | Provider omission or crawl failure is not verified removal | Verify before proposing recovery; confirmed loss rate |
| CAP-AUTH-06 Broken-link reclamation | External source link plus failed target and intended replacement → recovery candidates | Unrelated replacement harms users; rights/control may be absent | Prepare scoped destination repair; semantic target fit and live response |
| CAP-AUTH-07 Unlinked mention opportunities | Permitted mention locators and resolved business entity → opportunities | Same-name businesses and intentionally unlinked citations create false positives | Prepare relevant outreach suggestion, never auto-send; verified entity relevance |
| CAP-AUTH-08 Digital PR evidence opportunities | Original business evidence and relevant publication interests → story hypotheses | Newsworthiness is uncertain; no paid manipulation or invented research | Propose substantiated story; evidence completeness and human acceptance |
| CAP-AUTH-09 Spam-pattern investigation | Link provenance, repeated patterns and applicable policy → suspected abuse | Suspicious patterns are not proof of customer intent or penalty | Escalate investigation; confirmed evidence, no automatic disavow |

## BRAND — Brand, entity and reputation integrity

Profile P+C+R, CONTEXT+PERIOD. All businesses; optional verified brand/identity records. Purpose: resolve who is represented and whether search-facing claims are accurate. K11/K12; platform entity-panel behavior needs release research.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-BRAND-01 Entity disambiguation | Brand aliases, identifiers and contextual mentions → entity links | Similar logos/names do not prove same entity | Preserve unresolved alternatives; reviewed resolution precision |
| CAP-BRAND-02 Search-facing identity consistency | Site and observed profile/panel/source facts → conflicts | Sources update at different times; a public panel is not customer authority | Recommend factual correction path; dated field agreement |
| CAP-BRAND-03 Reputation claim assessment | Source passages, dates and entity mapping → supported concerns/themes | Allegations are not established facts; do not amplify unrelated people | Escalate substantiation; claim lineage and correction rate |
| CAP-BRAND-04 Impersonation and brand confusion | Lookalike presence plus identity evidence → suspicious resemblance | Authorized resellers/franchises may resemble the brand | Route owner/security review; confirmed unauthorized identity cases |

## SERP — Search result intelligence

Profile C+R, PERIOD. Context-specific search surfaces, licensed acquisition only. Purpose: observe competitive result composition. K06 for first-party distinctions; collection contracts require release research. No universal or deterministic rank.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-SERP-01 Result capture and normalization | Query/engine/location/device/time plus artifact → typed results | Ads, organic links, packs and answer modules have different position semantics | Preserve surface slots; parser accuracy against artifacts |
| CAP-SERP-02 Feature opportunity assessment | Observed feature plus offering/page relevance → eligibility investigation | Feature presence for one query does not guarantee entry | Request current feature-rule review; relevance and observed eligibility |
| CAP-SERP-03 Volatility detection | Comparable repeated snapshots → change distribution | Provider/parser changes or location drift can mimic volatility | Validate collection stability; stable-context change rates |
| CAP-SERP-04 Intent-shift diagnosis | Repeated result types/content and query context → intent-shift hypothesis | Temporary news intrusion may not be durable intent change | Observe persistence before replanning; classification stability |
| CAP-SERP-05 Visibility accounting | Comparable result observations and declared weighting → contextual visibility | Weighted share is a model, not total market share or traffic | Show context and denominator; sensitivity to weighting and coverage |

## COMP — Competitor and territory intelligence

Profile P+C+R, LIVE+PERIOD. Business/intent/geographic scopes; optional licensed authority data. Purpose: learn from competing search assets without copying content or treating competitors as authoritative business strategy.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-COMP-01 Contextual competitor discovery | Comparable SERPs and entity/site identities → search competitors | Directories and publishers may compete in search without selling the same service | Separate commercial/search roles; contextual overlap |
| CAP-COMP-02 Competitor page monitoring | Permitted dated page snapshots → material changes | Rotating banners and personalization can create noise | Investigate relevant substantive changes; reproducible content deltas |
| CAP-COMP-03 Territory gap reasoning | Competitor visibility and own relevant offerings → opportunity hypotheses | Competitor rank does not prove profitability or feasibility | Evaluate own business fit; qualified gap acceptance |
| CAP-COMP-04 Authority comparison | Same-source/window link evidence → comparative patterns | Vendor coverage and site age can bias comparisons | Investigate useful evidence gaps; comparable denominators and uncertainty |

## GSC — Google organic-search connections

Profile C, PERIOD; verified property mappings required. K06/K07. Purpose: ingest actual first-party reports while preserving aggregation limits. Ecosystem connections are capability-specific; Google account access is not general product authority.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-GSC-01 Property and permission mapping | Authorized property list/scopes and site mapping → connection coverage | URL-prefix and domain properties need explicit mapping; overlap can double count | Confirm eligible scopes; access and overlap checks |
| CAP-GSC-02 Performance ingestion | API request dimensions/date/type and response → revisioned metrics | Missing rows and partial recent data cannot become zeros | Refresh eligible windows; row completeness metadata |
| CAP-GSC-03 Search appearance analysis | Supported dimensions/filters with definitions → appearance cohorts | Feature categories and reporting support change; incomparable totals mislead | Compare compatible cohorts; definition version and denominator |
| CAP-GSC-04 Indexation signal ingestion | Supported authorized inspection/report observations → reported evidence | Manual exports are distinct from an API feature; no invented endpoint | Preserve acquisition method; inspected-set coverage and age |
| CAP-GSC-05 Relevant ecosystem activation | Confirmed need and separate product scopes → connector activation plan | Business Profile, merchant data and analytics are different permission domains | Connect only decision-relevant sources; actual granted coverage |

## BING — Bing and URL notification

Profile C+R, PERIOD+RULE. Bing-relevant businesses and connected sites. K18/K19. Purpose: preserve independent engine evidence. Bing guideline/API methods remain release-verification gates where public retrieval is incomplete.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-BING-01 Webmaster connection scope | Verified provider identity/site/grants → coverage | Do not assume Google authentication or dimensions apply | Validate adapter contract; permission and site-map checks |
| CAP-BING-02 Search/index observations | Supported dated provider response/export → provider-specific evidence | Unsupported methods and unavailable data remain unknown | Reconcile comparable periods; source coverage and error rate |
| CAP-BING-03 IndexNow eligibility assessment | Host, URL ownership/key-location evidence and current protocol → readiness | A public URL alone supplies no submission authority | Prepare eligibility recommendation only; scope/key validation |
| CAP-BING-04 Submission receipt reconciliation | Authorized future submission receipt and subsequent observations → separate delivery/adoption states | Receipt acceptance is not indexing; external notification cannot be undone | Monitor without duplicate blind retries; receipt coverage and observed adoption |

## AI — AI search, AEO and GEO observation

Profile C+R, PERIOD+RULE. Relevant answer surfaces; licensed/permitted collection, source/model/prompt/context recorded. K20. Purpose: observe accurate business/source representation; never create a universal “AI visibility” score or fictional special ranking rule.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-AI-01 Surface and sampling design | Relevant business questions, supported surface access and fixed context → sample protocol | Prompt panels are not population search demand | Predeclare sample and repeat policy; representativeness limits |
| CAP-AI-02 Answer and citation capture | Full permitted answer/citation artifact with time/model/surface → observations | Responses vary; absent citations in one run are not permanent exclusion | Repeat comparable samples; capture integrity and variability |
| CAP-AI-03 Citation/source resolution | Citation target, redirects and answer passage → source relationships | Mentioning a brand differs from citing its site; citation may not support the claim | Verify cited support; resolved/supporting citation share |
| CAP-AI-04 Answer accuracy assessment | Answer claims and confirmed business/source facts → conflicts | Model response is evidence of what it said, not truth about the business | Recommend source clarity or correction investigation; verified factual error rate |
| CAP-AI-05 Answer-readiness reasoning | Useful relevant content, accessibility and applicable guidance → improvement hypotheses | No special file/schema guarantees inclusion; AEO/GEO labels confer no new authority | Improve supported task answers; independently reviewed usefulness and later observations |

## ANA — Measurement and conversion-aware SEO

Profile C+R, PERIOD. All archetypes with authorized measurement; optional aggregate lead quality/revenue records. Purpose: qualified business contribution. Consent, currency, timezone, deduplication and attribution definitions precede comparisons; source-specific API rules require release research.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-ANA-01 Instrumentation coverage | Authorized event definitions and aggregate delivery evidence → measurement health | Missing consent/ad blockers can reduce coverage; no fabricated event tests on live forms | Recommend instrumentation review; coverage and duplicate-event rate |
| CAP-ANA-02 Organic attribution | Versioned channel/referrer attribution and source windows → attributed outcomes | “Direct,” cross-device and dark traffic prevent complete attribution | Explain model limits; comparable channel definitions |
| CAP-ANA-03 Conversion qualification | Confirmed goal criteria and observed events → qualified counts | Clicks, submissions, leads and sales are distinct; spam leads are not value | Apply explicit qualification; validated count and exclusion reasons |
| CAP-ANA-04 Lead value reconciliation | Authorized aggregate lifecycle/source linkage → lead-quality outcomes | Unmatched leads and long sales cycles create censoring; no private individual export by default | Report observed match coverage; qualified lead cohort value |
| CAP-ANA-05 Conversion-aware prioritization | Page/intent relevance plus qualified outcome evidence → value-informed opportunities | Sparse data does not justify discarding new territory | Use uncertainty-aware priorities; held-out value estimation |
| CAP-ANA-06 Attribution and tracking drift | Definition/release history plus metric discontinuities → drift hypothesis | Demand changes can coincide with tracking updates | Separate instrumentation from growth; reconciled series continuity |

## CHG — Change protection and migrations

Profile P+C+R+V, EVENT+LIVE. All managed assets; optional verified deployments and server logs. Purpose: preserve wins and attribute changes honestly. Future migrations are Expert Review with resource-specific rollback; release research for platform move guidance.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-CHG-01 Deployment/change correlation | Dated before/after artifacts and optional deployment receipts → change timeline | Public change detection cannot identify who deployed it | Investigate material changes; observed versus confirmed deployment distinction |
| CAP-CHG-02 Regression detection | Comparable baseline, invariants and new observations → regression candidates | Intentional redesign or transient crawl failure can mimic regression | Prioritize protected-asset verification; confirmed regression precision |
| CAP-CHG-03 Migration inventory and mapping | Old inventory, new intended destinations and value evidence → mapping proposal | Blanket home-page redirects lose intent; unknown assets cannot be discarded | Review complete scoped mapping; unmapped protected assets |
| CAP-CHG-04 Migration readiness validation | Mapping, previewed targets/directives/links and recovery plan → readiness result | Staging configuration may intentionally differ; validation needs environment identity | Block incomplete rollout; predeclared invariant pass rate |
| CAP-CHG-05 Post-change verification and recovery | Authorized deployment receipts, actual post-state and guardrails → verified/failed/unknown outcome | API success is not live deployment; concurrent human edits prohibit blind restore | Recommend governed compensation; target-state and recovery checks |

## POL — Search policy and security integrity

Profile P+C+G, RULE+EVENT. All capabilities and assets; optional authorized platform security/manual-action reports. K12 and applicable sources from 17. Purpose: enforce integrity independently of model reasoning. Security diagnosis does not authorize penetration testing.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-POL-01 Applicable policy resolution | Platform/surface/context and approved source releases → applicable rule set | Third-party advice cannot override platform prohibitions | Block unresolved safety-sensitive scope; rule applicability fixtures |
| CAP-POL-02 Spam/manipulation assessment | Concrete tactic/content/link evidence and applicable rules → suspected violations | Scale or AI assistance alone is not proof; evaluate behavior and purpose | Escalate supported cases; adjudicated precision and abstention |
| CAP-POL-03 Search security anomalies | Public compromised-content/redirect evidence and authorized alerts → anomaly claims | Geo/CDN differences can resemble cloaking; do not probe privileged endpoints | Notify scoped security owner; reproduced malicious effects |
| CAP-POL-04 Platform enforcement observation | Authorized warning/manual-action/security message → reported enforcement | Ranking drops alone cannot prove an action or penalty | Preserve exact report and required review; confirmed report lineage |
| CAP-POL-05 Capability authority enforcement | Current grants, skill/policy versions and request → allow/deny | Advisory model risk assessments cannot grant credentials | Deny unsupported operations; negative authorization fixture results |

## EXP — Experimentation and evaluation

Profile V+R, frozen observation windows. All intervention cohorts with sufficient data. Purpose: learn defensible site-specific improvements. Independent evaluation owner; K21 is a mechanism reference, not SEO statistical authority. Methods require explicit assumptions and reviewed statistical protocol.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-EXP-01 Design and baseline freezing | Hypothesis, eligible cohort, baseline, metric and guardrails → immutable design | Sparse traffic may make a causal experiment infeasible | Choose observation or defensible design; pre-exposure completeness |
| CAP-EXP-02 Exposure and interference tracking | Actual changes, cohorts, concurrent edits and timing → exposure record | Internal linking and shared templates contaminate page controls | Exclude/cluster affected units; contamination and crossover rate |
| CAP-EXP-03 Outcome evaluation | Frozen evaluator and revisioned dataset → effect/uncertainty | Repeated peeking, correlated rows and algorithm shifts bias conclusions | Keep/iterate/revert recommendation or inconclusive; method/guardrail adherence |
| CAP-EXP-04 Learning promotion | Independent evaluation and scope/counterexamples → learning candidate | One successful edit is not a universal rule; site priors stay isolated | Review site-scoped adjustment; held-out correction and drift |
| CAP-EXP-05 Experiment portfolio protection | Active exposure registry and competing plans → overlap conflicts | Separate agents may share hidden template dependencies | Serialize/conflict-check treatment; concurrent contamination avoided |

## MEM — Temporal memory and graph integrity

Profile R+G, EVENT; all persisted knowledge. Purpose: maintain continuity without laundering inference into fact. Optional embeddings are retrieval aids. Sources are original observation/claim manifests; authority and time semantics come from 09/10.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-MEM-01 As-known-then retrieval | Recorded/valid times and revision lineage → historical evidence bundle | Later corrections must not leak into a past decision | Reconstruct manifest; temporal boundary fixtures |
| CAP-MEM-02 Contradiction preservation | Conflicting claims with scope and provenance → dispute record | Different dates/locales may resolve apparent disagreement | Request distinguishing observation; unresolved material disputes |
| CAP-MEM-03 Graph projection integrity | Canonical entity/assertion records and watermark → authorized graph | Similarity is not identity; missing projection edges are not missing facts | Rebuild bounded projection; provenance and tenant consistency |
| CAP-MEM-04 Retention and correction propagation | Deletion/correction ledger plus derivative inventory → propagation status | Rebuilt caches/backups can resurrect removed data | Quarantine stale derivatives; deletion/correction completeness |

## UX — Business interpretation and reporting

Profile R, input-dependent freshness. All customer/expert views. Purpose: make evidence usable without exposing unnecessary complexity. [20](20-CLIENT-INTERPRETATION-MODEL.md) is the translation contract; no invented business impact or activity animation.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-UX-01 Business interpretation | Structured finding, relevance, scope and uncertainty → business card | Fluent summaries can add unsupported causes or promises | Use validated claim-preserving language; entailment and comprehension |
| CAP-UX-02 Outcome reporting | Compatible metrics and definitions → scoped result narrative | Visibility, attributed revenue and causal effect differ | Report unavailable outcomes honestly; recomputable totals |
| CAP-UX-03 Meaningful inbox triage | Materiality, duplicate events and current decisions → inbox items | Repeated low-risk warnings create fatigue; silence must not hide critical risks | Coalesce by incident; meaningful-event coverage and duplicate rate |
| CAP-UX-04 Real Brain exploration | Authorized graph/watermark and event provenance → interactive neighborhood | Cluster counts cannot imply unobserved connections | Offer evidence drill-down/list alternative; visible assertion integrity |

## AUDIT — Brain reliability and self-audit

Profile G+V, EVENT. All internal systems; [21](21-BRAIN-SELF-AUDIT.md) specifies checks, actions and recovery. Purpose: constrain autonomy when the Brain cannot trust its inputs or execution. Checks may reduce permissions, never promote themselves.

| ID / responsibility | Minimum evidence → output | Diagnosis and uncertainty | Candidate response; verification / signal |
| --- | --- | --- | --- |
| CAP-AUDIT-01 Sensor and connector reliability | Run/error/coverage/grant telemetry → scoped health | Success status with empty partial data is not healthy coverage | Pause affected conclusions; missingness and freshness detection |
| CAP-AUDIT-02 Skill and evidence readiness | Release/revocation/dependency manifests and evidence cutoff → eligibility | Cached approved status can conceal revocation | Quarantine affected work; stale/revoked fixture denial |
| CAP-AUDIT-03 Work and cost control | Attempts, deadlines, spend reservations and progress → failure/runaway detection | Long legitimate jobs need budgets, not arbitrary retry storms | Suspend/coalesce work; bounded cost and recovery throughput |
| CAP-AUDIT-04 Decision and evaluation reliability | Strategy age, review labels and frozen evaluation history → drift/gap report | No labels means calibration unknown; not perfect accuracy | Lower autonomy and request review; calibration and overdue evaluation coverage |
| CAP-AUDIT-05 Enforcement and deployment integrity | Independent policy heartbeat, grants and attempt ledger → authority health | Unknown remote outcome cannot be called failure or safely retried | Halt dispatch and reconcile; unauthorized attempts and unresolved effects |

## Cross-domain composition

A page's robots observation can constrain IDX, COM, INT, MAP and TER without five independent crawls. Evidence is reused by reference under matching tenant, time and context; interpretations retain their separate claim IDs. Hard dependencies form a DAG per assessment. Ongoing learning returns through versioned events, not circular skill imports.

Representative paths: BUS → AUD → DEM → MAP → TER selects an investigation; CRW → HTTP/ROB/SMP → URL/JS → IA/LNK builds the observable website; SD/CNT/COM/LOC/INT add applicable meaning; GSC/BING/SERP/AI/ANA enrich actual visibility and outcomes; CHG/POL/EXP/MEM/AUDIT constrain every stage; UX translates the selected result. This is one persistent Brain with shared evidence and strategy authority.
