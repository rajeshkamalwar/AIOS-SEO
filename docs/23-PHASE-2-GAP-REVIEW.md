# 23 — Phase 2 Gap Review

Status: specification complete for review, no application implementation authorized. Baseline: Phase 1 branch commit `baf1f07536908c3bcb50724ad25a4917391d504b`; canonical 00–06 unchanged. AGENTS.md, README and docs 00–13 were reread before this phase. Documents 14–23 extend their contracts and explicitly retain unresolved acceptance decisions.

## 1. Coverage and depth verdict

The Phase 2 inventory defines **36 domains and 195 meaningful capabilities**. Count only unique table rows with `CAP-...` IDs in 14; domain headings, skill packs, audit checks, reference mechanisms and archetype overlays are not additional capabilities. All 195 have distinct evidence/output/diagnosis/response/check responsibilities with shared invariants from 15. They are **domain-specified, not executable or empirically validated**.

The ten documents define contract composition, governed immutable skills, source refresh and revocation, all 15 requested archetype overlays, one bounded read-only slice, business/expert projections, 22 self-audit checks and explicit external-reference dispositions. Eight candidate read-only skills describe procedures and negative fixtures; none is released software.

The main additions/refinements beyond the terse original 32-family universe are: conservative entity/URL identity; page/variant and hybrid-business scope; crawl coverage accounting; source finality and temporal corrections; policy-limited rendering versus site failure; framework behavior and generated-site integrity; non-HTML assets and marketplace supply; retention/correction propagation; experiment interference; real graph lineage; scoped audit recovery and independent publication gates. These are responsibilities needed to connect the loop, not separate tool products.

## 2. Tensions resolved or preserved

| Finding | Phase 2 treatment | Remaining decision |
| --- | --- | --- |
| 00's total source hierarchy versus claim-specific truth | User explicitly requires five evidence classes and no universal truth score; 15/17 implement that distinction | Record formal D01 acceptance; do not silently edit the constitution |
| 13's eventual title-change example versus first-slice read-only instruction | 19 explicitly places all website actions later; initial Act means governed observation/internal persistence | No owner question needed: first-slice authority is explicit in this request |
| URL-first versus uncertain business facts | Provisional field-level Twin and targeted material questions; 18 multi-label scope | Customer confirms only material business uncertainties, not every inferred field |
| Complete universe versus implementation readiness | 195 semantic contracts with inheritance; source-specific executable packs remain release-gated | Exact schemas/fixtures and accepted runtime choices remain necessary |
| AI/generated-site detection versus unsupported authorship claims | Observe broken links, placeholders, fabricated claims and rendering, not an AI-origin score | No general AI-content detector proposed |
| Rich 3D Brain versus mobile simplicity | Evidence-backed bounded graph, accessible list/2D first, 3D optional | Renderer usability benchmark later; no visual-stack commitment now |
| Provider independence versus special capabilities | Versioned adapters and task-quality/privacy evaluation; unsupported fallback abstains | Select initial tested providers under data constraints before production |
| Reusable priors versus tenant isolation | Site-local correction/learning; global promotion remains disabled | Cross-tenant learning would need separate privacy/product approval |
| Read-only versus persistent Brain | External observation only; internal evidence/world-state writes required | Physical storage/access model still needs engineering acceptance |

## 3. Blockers before implementing the read-only Brain

| Gate / relation to 13 | What Phase 2 supplies | Still needed / accountable role |
| --- | --- | --- |
| Domain/access S02/S03, D01/D02 | Typed semantic records, scoped capability profiles and tenant invariants | Physical keys/constraints, permission matrix, authenticated tenant lifecycle and tested scope propagation; domain/security |
| Evidence/event S04 | Time, missingness, lineage and output records; continuation of 09/10 | Machine-readable schemas, migrations, precise command/error enums and atomic storage/outbox protocol; platform |
| Public sensor S05 | Concrete limits, frontier accounting, robots/egress/render scope and failure behavior in 19 | Parser/URL/robots conformance fixtures, network threat model, resource admission rules and browser sandbox design; perception/security |
| Skills S06, D10 | Immutable release contract, eight draft procedures and negative cases | Hash-pinned source revisions, exact I/O/tool schemas, named reviewers, held-out corpus and predeclared cohort quality thresholds; SEO/evaluation |
| Data lifecycle D06 | Isolation/minimization and explicit no global learning | Region, actual retention/deletion/backup policy, model data-use agreements and support access; product/security |
| Runtime/capacity D07/D08 | Bounded first-slice budget proposal and workload separation | Accepted ADRs for storage/orchestration/runtime; cost model, load fixtures, RPO/RTO and recovery design; engineering/platform |
| Client/graph S10 | Business cards, genuine edges, watermarks and comprehension criteria | Serialized API schemas, pagination/filter auth rules, static acceptance examples and accessibility test plan; domain/client |
| Evaluation S08 | Critical invariant gates and operational first-slice measurements | Label protocol, corpus sizes, precision/recall targets by supported cohort and evaluator ownership before model trials; evaluation |

These gates do not require resolving every future integration or website actuator. GSC/Bing/SERP licensing/API contracts block their connectors, not public discovery. Auto-promotion and causal-growth experiment thresholds block future authority/learning, not read-only extraction. D04/D05's external write decisions are explicitly deferred.

## 4. Recommended Phase 3

**Close and validate the read-only implementation contracts, then authorize a separately bounded implementation.** Avoid another broad universe expansion.

1. Record accepted/amended decisions for the read-only boundary, tenant identity, evidence semantics and replaceable runtime candidates. Preserve rejected/superseded rationale.
2. Author physical domain/access schema and versioned command/event/tool/output JSON schemas for 19; define failure and atomicity contracts with examples.
3. Build a documentation fixture corpus: synthetic HTML/headers/sitemaps/DOM snapshots, expected Twin/graph/coverage/decision records and negative security cases. These fixtures should cover local service, SPA, commerce, publisher and hybrid cases without collecting private customer data.
4. Pin the eight initial skill/source manifests, choose supported languages/page cohorts and freeze quality thresholds before evaluating models. Do not enable every catalog capability just because its row exists.
5. Specify operational budgets, sandbox/egress controls, data lifecycle, recovery and independent audit probes. Validate the design using end-to-end traces, including partial crawl, policy-limited rendering, revocation and tenant collision.
6. With those contracts accepted and an explicit implementation instruction, build only the persistent read-only slice. Measure evidence correctness and usefulness first; no publishing, platform submissions or claimed causal growth.

The first implementation need not wait for a native client or a dedicated graph database, but its API and test scenarios must preserve mobile business meaning and real graph provenance. Do not create an expert audit dashboard as the default product in the interim.

## 5. Decisions that genuinely need owner approval

- **Privacy and operational commitments:** permitted processing regions/providers, retention/deletion/support access and any future global learning. Engineering cannot choose materially different customer data-use rights as a minor default.
- **Business authority and scope:** any future website/platform write authority and Auto grants; no such grant is needed or implied for this specification phase.
- **Product prioritization if changing direction:** the first commercial customer segment and qualified success outcome. The local-service fixture is a reversible engineering recommendation; turning it into permanent product exclusion would require an owner decision.
- **Constitutional acceptance:** formalize claim-specific authority consistent with this request and 13/D01. Phase 2 does not silently accept all Phase 1 technology recommendations.

No outstanding owner answer prevents completing these documents. Crawl limits, 2D-first exploration, candidate skill grouping and proposed internal schemas are reversible engineering recommendations; they can proceed to contract review without repeated minor questions. Numerical production SLOs and cost commitments need accountable acceptance before promises are made to customers.

## 6. Minimum-topic traceability

The following maps every one of the user's 140 minimum topics to concrete capability owners. Topics can share an owner when they are alternate names for the same responsibility; this avoids fake granularity. The 195-row catalog contains further distinct responsibilities.

| Minimum topic | Capability owner |
| --- | --- |
| 1. Business understanding | CAP-BUS-01 |
| 2. Business archetype classification | CAP-BUS-02 |
| 3. Customer identification | CAP-AUD-01 |
| 4. Search journey | CAP-AUD-02 |
| 5. Search intent | CAP-AUD-03 |
| 6. Demand intelligence | CAP-DEM-03 |
| 7. Keyword discovery | CAP-DEM-02 |
| 8. Keyword clustering | CAP-DEM-04 |
| 9. Topic/entity modeling | CAP-DEM-05 |
| 10. Query-to-page mapping | CAP-MAP-02 |
| 11. Cannibalization | CAP-MAP-03 |
| 12. Search territory | CAP-TER-01 |
| 13. Geographic expansion | CAP-TER-03 |
| 14. Crawl discovery | CAP-CRW-01 |
| 15. Crawl prioritization | CAP-CRW-02 |
| 16. robots.txt | CAP-ROB-01 |
| 17. meta robots | CAP-ROB-02 |
| 18. X-Robots-Tag | CAP-ROB-03 |
| 19. XML sitemaps | CAP-SMP-01 |
| 20. HTTP status behavior | CAP-HTTP-01 |
| 21. redirects | CAP-HTTP-02 |
| 22. redirect chains/loops | CAP-HTTP-03 |
| 23. URL normalization | CAP-URL-01 |
| 24. canonicalization | CAP-URL-02 |
| 25. duplicate content | CAP-URL-03 |
| 26. soft 404s | CAP-HTTP-04 |
| 27. indexability | CAP-IDX-01 |
| 28. index coverage | CAP-IDX-02 |
| 29. crawl/index discrepancies | CAP-IDX-03 |
| 30. JavaScript SEO | CAP-JS-02 |
| 31. rendering | CAP-JS-02 |
| 32. hydration | CAP-JS-03 |
| 33. raw HTML vs rendered DOM | CAP-JS-02 |
| 34. client-side navigation | CAP-JS-04 |
| 35. dynamic metadata | CAP-JS-05 |
| 36. blocked resources | CAP-JS-06 |
| 37. modern framework SEO | CAP-JS-07 |
| 38. AI-generated website failure modes | CAP-JS-08 |
| 39. information architecture | CAP-IA-01 |
| 40. taxonomy | CAP-IA-01 |
| 41. navigation | CAP-IA-02 |
| 42. breadcrumbs | CAP-IA-03 |
| 43. click depth | CAP-IA-04 |
| 44. orphan pages | CAP-IA-05 |
| 45. internal authority flow | CAP-LNK-02 |
| 46. contextual internal linking | CAP-LNK-03 |
| 47. anchor strategy | CAP-LNK-04 |
| 48. titles | CAP-PAGE-01 |
| 49. meta descriptions | CAP-PAGE-02 |
| 50. headings | CAP-PAGE-03 |
| 51. snippets | CAP-PAGE-05 |
| 52. page intent alignment | CAP-PAGE-04 |
| 53. semantic/topic coverage | CAP-CNT-01 |
| 54. content usefulness | CAP-CNT-02 |
| 55. originality | CAP-CNT-03 |
| 56. experience/evidence | CAP-CNT-04 |
| 57. content completeness | CAP-CNT-05 |
| 58. freshness | CAP-CNT-06 |
| 59. decay | CAP-CNT-07 |
| 60. consolidation | CAP-CNT-08 |
| 61. pruning risk | CAP-CNT-09 |
| 62. structured data | CAP-SD-01 |
| 63. schema eligibility | CAP-SD-02 |
| 64. entity IDs | CAP-SD-03 |
| 65. rich-result validation | CAP-SD-05 |
| 66. image SEO | CAP-MED-01 |
| 67. video SEO | CAP-MED-03 |
| 68. Core Web Vitals | CAP-PERF-01 |
| 69. LCP | CAP-PERF-02 |
| 70. INP | CAP-PERF-03 |
| 71. CLS | CAP-PERF-04 |
| 72. TTFB | CAP-PERF-05 |
| 73. mobile SEO | CAP-PERF-06 |
| 74. local SEO | CAP-LOC-01 |
| 75. Google Maps/local presence | CAP-LOC-02 |
| 76. business identity consistency | CAP-LOC-03 |
| 77. reviews/reputation | CAP-LOC-04 |
| 78. local citations | CAP-LOC-05 |
| 79. service-area strategy | CAP-LOC-06 |
| 80. multi-location SEO | CAP-LOC-07 |
| 81. ecommerce SEO | CAP-COM-01 |
| 82. product SEO | CAP-COM-01 |
| 83. category SEO | CAP-COM-02 |
| 84. variants | CAP-COM-03 |
| 85. faceted navigation | CAP-COM-04 |
| 86. product availability/discontinued states | CAP-COM-05 |
| 87. merchant/search-commerce signals | CAP-COM-06 |
| 88. international SEO | CAP-INT-01 |
| 89. multilingual SEO | CAP-INT-03 |
| 90. hreflang | CAP-INT-02 |
| 91. authority | CAP-AUTH-02 |
| 92. backlinks | CAP-AUTH-01 |
| 93. referring-domain quality | CAP-AUTH-02 |
| 94. topical link relevance | CAP-AUTH-03 |
| 95. anchor distribution | CAP-AUTH-04 |
| 96. lost-link recovery | CAP-AUTH-05 |
| 97. broken-link reclamation | CAP-AUTH-06 |
| 98. unlinked mentions | CAP-AUTH-07 |
| 99. digital PR opportunities | CAP-AUTH-08 |
| 100. spam/toxic-pattern analysis | CAP-AUTH-09 |
| 101. brand/entity signals | CAP-BRAND-01 |
| 102. reputation | CAP-BRAND-03 |
| 103. SERP intelligence | CAP-SERP-01 |
| 104. SERP features | CAP-SERP-02 |
| 105. SERP volatility | CAP-SERP-03 |
| 106. intent shifts | CAP-SERP-04 |
| 107. competitor discovery | CAP-COMP-01 |
| 108. competitor page monitoring | CAP-COMP-02 |
| 109. competitor territory | CAP-COMP-03 |
| 110. competitor authority | CAP-COMP-04 |
| 111. Google Search Console | CAP-GSC-01 |
| 112. Google search performance | CAP-GSC-02 |
| 113. Google indexation signals | CAP-GSC-04 |
| 114. search appearance | CAP-GSC-03 |
| 115. Google ecosystem connections relevant to organic search | CAP-GSC-05 |
| 116. Bing Webmaster | CAP-BING-01 |
| 117. IndexNow | CAP-BING-03 |
| 118. AI Search | CAP-AI-01 |
| 119. AEO | CAP-AI-05 |
| 120. GEO | CAP-AI-05 |
| 121. citation/source visibility | CAP-AI-03 |
| 122. AI answer monitoring | CAP-AI-02 |
| 123. analytics | CAP-ANA-01 |
| 124. organic attribution | CAP-ANA-02 |
| 125. conversions | CAP-ANA-03 |
| 126. lead attribution | CAP-ANA-04 |
| 127. conversion-aware SEO | CAP-ANA-05 |
| 128. deployment/change monitoring | CAP-CHG-01 |
| 129. SEO migrations | CAP-CHG-03 |
| 130. regression detection | CAP-CHG-02 |
| 131. search policy | CAP-POL-01 |
| 132. spam policy | CAP-POL-02 |
| 133. security/search integrity | CAP-POL-03 |
| 134. experiments | CAP-EXP-01 |
| 135. evaluation | CAP-EXP-03 |
| 136. causal uncertainty | CAP-EXP-03 |
| 137. temporal memory | CAP-MEM-01 |
| 138. reporting | CAP-UX-02 |
| 139. business interpretation | CAP-UX-01 |
| 140. Brain self-audit. | CAP-AUDIT-01 |

## 7. Domain count reconciliation

| Domain | Capabilities |
| --- | --- |
| BUS | 6 |
| AUD | 5 |
| DEM | 6 |
| MAP | 5 |
| TER | 5 |
| CRW | 6 |
| ROB | 5 |
| SMP | 4 |
| HTTP | 5 |
| URL | 5 |
| IDX | 5 |
| JS | 8 |
| IA | 5 |
| LNK | 5 |
| PAGE | 5 |
| CNT | 9 |
| SD | 5 |
| MED | 5 |
| PERF | 6 |
| LOC | 7 |
| COM | 8 |
| INT | 5 |
| AUTH | 9 |
| BRAND | 4 |
| SERP | 5 |
| COMP | 4 |
| GSC | 5 |
| BING | 4 |
| AI | 5 |
| ANA | 6 |
| CHG | 5 |
| POL | 5 |
| EXP | 5 |
| MEM | 4 |
| UX | 4 |
| AUDIT | 5 |
| **Total: 36 domains** | **195** |

## 8. Validation scope

Documentation validation checks unique capability IDs, all 140 floor mappings, archetype coverage, required files, relative links, reading order, reference IDs, Markdown structure and documentation-only diff scope. Runtime behavior, model quality, API access, actual search performance and security controls have not been tested because no application is implemented. Source retrieval limitations, notably Bing guideline text, remain explicitly recorded in 17.
