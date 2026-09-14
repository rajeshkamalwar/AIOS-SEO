# 15 — Capability Contract

Status: Phase 2 domain specification, proposed for acceptance. Extends [08](08-DOMAIN-MODEL.md)–[11](11-AUTONOMY-AND-GOVERNANCE.md); does not approve an implementation or an executable skill. **The Brain may reason freely, but it acts only through governed skills and explicit tools.**

## 1. Contract composition

A capability is a stable responsibility, not an agent, screen, prompt or permission. One skill can implement several capabilities; a capability can have different skills for different platforms. Strategy activates capabilities to serve a business objective. Sensors collect observations, tools perform typed operations, and agents apply released procedures. Capability relevance never grants tool authority.

The canonical definition is composed from: universal invariants here + a domain profile and a uniquely identified row in [14](14-CAPABILITY-TAXONOMY.md) + archetype activation in [18](18-BUSINESS-ARCHETYPE-MATRIX.md). Row-specific rules override descriptive defaults but cannot weaken prohibitions. Conflicting constraints intersect; an empty intersection blocks work. Release compilation materializes every inherited field and records the hashes of its parents. No runtime ambiguity about which prose takes precedence is permitted.

Taxonomy rows define distinct outputs, minimum evidence, discriminating diagnosis, counterexamples, candidate response and a verification/measurement signal. They are domain contracts, not claims of tested executable availability. Promotion to `executable` requires the schemas, fixtures, source revisions and owners in [16](16-SEO-SKILLS-ARCHITECTURE.md). New capabilities need an output or decision boundary that an existing capability cannot own; synonyms are aliases, not new IDs.

## 2. Canonical definition schema

`R` = required in every definition; `C` = required under the condition stated; `O` = optional with no implied default. Empty lists mean intentionally none; omission is permitted only for O fields. Unknown runtime data uses an explicit status, never an omitted definition. IDs are stable strings; versions and hashes refer to immutable artifacts. Enumerations below are closed per schema version, with namespaced extensions requiring a schema change.

| Field | Type / requirement | Semantics |
| --- | --- | --- |
| capability_id | ID, R | `CAP-<domain>-<number>`; never reused or renumbered |
| contract_version, schema_version | SemVer, R | Domain semantics versus serialization compatibility |
| domain, subdomain, name | strings, R | Domain code; row responsibility serves as subdomain unless separately named |
| purpose, business_relevance | text, R | Distinct output and business decision it supports; no generic “improve SEO” |
| objectives | nonempty set, R | Understand/Grow/Protect; Measure/Learn are supporting loop functions, not permission to invent another objective |
| applicable_archetypes, applicable_site_page_types | predicates, R | Include exclusion and unknown-applicability behavior; overlays from 18 |
| prerequisites | typed predicates, R | Asset scope, input contracts, policy and upstream versions; can be empty |
| required_sensors, optional_sensors | capability references, R | Required evidence-producing interfaces; optional data cannot silently become mandatory |
| required_evidence | typed requirements, R | Subject, artifact locator, context, source type, age, coverage and cardinality |
| evidence_sufficiency | predicate + failure outcome, R | For each conclusion tier; insufficient evidence yields unknown, investigation or abstention |
| observations, derived_beliefs | output schemas, R | Raw/parsed facts versus assessed interpretations; empty beliefs valid for pure collection |
| detection_logic | versioned rule/procedure reference, R | Candidate detection, including no finding and cannot-assess |
| diagnosis_logic | rule/procedure, C | Required when producing an explanation; include competing explanations and distinguishing observation |
| uncertainty, confidence_semantics | structured definitions, R | Coverage, freshness, ambiguity and method; calibrated numeric confidence is optional |
| relevant_skills, allowed_tools | refs + release constraints, R | Candidate skills may be `unreleased`; executable definitions require pinned compatible releases |
| possible_actions, forbidden_actions | typed effect descriptors, R | Recommendations are not deployments; explicit empty external-action list allowed |
| risk_class, blast_radius | assessment rule, R | Collection/data exposure and potential proposed intervention assessed separately |
| reversibility | tagged union, R | `not_applicable`, `conditional_inverse`, `compensation`, `manual`, `irreversible`; reason required |
| approval_requirements | policy reference, R | Includes “no website action permitted”; not inferred from low risk |
| policy_constraints | immutable policy refs, R | Global floor, site constraints, scope, rate and data use |
| verification | procedure + pass/fail/unknown, R | Check output correctness even when capability is read-only |
| measurement | metrics + units + grain + method, R | Capability quality/coverage always; business outcomes only with a valid source |
| observation_window | tagged definition, R | Instant observation, repeated observations or delayed source window; timezone and revisions |
| learning_signals | admissible signals + exclusions, R | May explicitly be none; never self-promote a skill |
| client_interpretation, expert_interpretation | projection contract refs, R | Business meaning and technical record; source facts survive translation |
| dependencies, conflicts | typed edges, R | Hard prerequisites, enrichments, invalidators, overlap and mutually exclusive proposals |
| freshness_requirements | cadence/max-age/invalidators, R | Both source guidance and live evidence; no timeless technical claim |
| source_provenance_requirements | source manifest policy, R | Normative applicability, observation lineage and derivative hashes |
| lifecycle_state, owner_role | enum + role, R | proposed/domain_specified/executable/deprecated/revoked; accountable owner before release |
| replacement_ids, deprecation_deadline | refs/time, C | Required when deprecated; no silent substitution for queued work |
| rollout_notes, examples | text, O | Non-authoritative explanation; examples never become real observations |

A `CapabilityAssessment` is a different record: assessment ID, tenant/site/scope, definition release hash, skill run, input manifest, as-known-at cutoff, applicability result, observation and belief IDs, sufficiency results, uncertainty, decision recommendation, policy result, output hashes, evaluated-at and refresh deadline. Definition records contain no tenant observations. Assessment records always carry tenant scope.

## 3. Epistemic types and failures

| Type | Meaning / allowed transition |
| --- | --- |
| FACT | Narrow verified assertion about a specified context; e.g. stored response bytes hash to H. Not an absolute SEO truth label |
| OBSERVATION | Sensor report at a time/context; collection success does not prove interpretation |
| BELIEF | Versioned assessment of one or more claims; supported/disputed/stale etc. from 09 |
| HYPOTHESIS | Testable explanation or prediction; may coexist with competing hypotheses |
| RECOMMENDATION | Proposed next step based on beliefs, business constraints and alternatives |
| ACTION | Governed execution record with authority and receipts; never fabricated from recommendation text |
| OUTCOME | Observed post-action metric/result; causality requires a separate evaluation |

Result state is `finding`, `no_finding_in_scope`, `cannot_assess`, `not_applicable` or `failed`. A failure is not a negative finding. Applicability is `applicable`, `conditional`, `unknown`, or `excluded`, independent of skill availability and result. Runtime evidence uses missingness from 09; the reason survives every projection. A source-limited absence can only support an absence claim about its declared coverage.

Confidence is a vector of source applicability, observation integrity, coverage, identity certainty and inferential support. Repeated snapshots from the same cache are not independent confirmation. A detector must define both a known false positive and a known false negative; [14](14-CAPABILITY-TAXONOMY.md)'s counterexamples seed those fixtures. Baseline/revision hashes prevent hindsight leakage. Numeric estimates require a calibration cohort, evaluation version and interval; otherwise use supported/provisional/disputed/unknown with reasons.

## 4. Shared execution profiles

These profiles supply concrete defaults for all taxonomy rows. Domain evidence names identify sensor outputs, not tools with implied availability. `required_sensors` are precisely the interfaces producing the row's minimum evidence. Domain optional sensors are enrichment only. Upstream capability outputs may satisfy evidence requirements if lineage and scope match.

| Profile | Permitted tools and effects | Risk / authority / recovery | Window and learning |
| --- | --- | --- | --- |
| P: public observation | `http.fetch_public`, `robots.evaluate`, `sitemap.parse`, `html.extract`, `render.observe`, `artifact.read_scoped`, `graph.query_scoped`, `model.infer_scoped`, `assessment.record` | Bounded public collection; privacy/egress/budget checks; no target mutation. Internal assessment revisions are superseded, not website rollback | Same-run artifact window; invalidate on observed deployment. Learn extraction error and coverage, not ranking efficacy |
| C: connected observation | P's offline parsers plus exact `connector.read_<family>` grant | Tenant/connection scope, licensed coverage and data minimization; disconnect pauses calls. No submissions or account edits | Provider reporting period and revision policy; learn connector completeness/errors |
| R: reasoning | Scoped evidence/graph reads, `model.infer_scoped`, deterministic analysis, `assessment.record` | Data exposure and recommendation risk; missing dependencies prevent authoritative conclusions | Input manifest cutoff and shortest relevant freshness; learn independently reviewed correction rate |
| V: verification/evaluation | Scoped artifacts, repeat observation under P/C, frozen evaluator | Separate evaluator authority; cannot change treatment or success rule | Frozen design window; inconclusive and invalid are legitimate; promotion independent |
| G: governance | Registry/ledger reads, deterministic policy evaluation, `work.quarantine`, `autonomy.reduce` | Can reduce scope; cannot grant itself privileges or modify site. Resumption is independently authorized | Event-driven plus heartbeat; learn missed detections from incident review |

Every row allows a recommendation of its named candidate response, and a request for the distinguishing observation. It forbids executing that response via these profiles. Future external effects require a separate ActionProposal, released actuator skill and 11's authority path. Profile P cannot be widened to a generic browser operator. Policy blocks fabricated content/reviews/credentials, spam, unlicensed data acquisition, cross-tenant retrieval and privilege escalation across all rows.

Default domain freshness profiles: `LIVE` = capture time stated, refresh on deployment or before a material recommendation if older than 24 hours; `PERIOD` = source period/watermark with finality, never “current” by fetch time alone; `CONTEXT` = inferred context reviewed at 30 days or immediate correction; `RULE` = source refresh policy in 17; `EVENT` = immediate invalidation on relevant event plus daily missed-event reconciliation. These are replaceable initial service policies, not platform facts or production SLOs. Historical evidence never expires out of history merely because it becomes unusable for a current decision.

Domain profiles in 14 add business relevance, scope, optional evidence, source families and risk concentration. The baseline assessment risk is `bounded_public_read` for P, `private_data_read` for C, `derived_recommendation` for R, `independent_evaluation` for V and `authority_control` for G; composed profiles retain all applicable tags. These are effect classes, not numeric confidence or automatic approval routes. Blast radius is the exact assessed URL/entity/cohort set plus known shared template, locale, variant and internal-link dependencies. Unknown dependencies produce `blast_radius_unknown`, never a page-only assumption.

For taxonomy assessments, external reversibility and website approval are `not_applicable: no external mutation allowed`; internal corrections append/supersede, with deletion governed separately by retention policy. A future recommendation's intervention risk must be reassessed: content/page edits may be bounded, navigation/templates/directives and identity consolidation are potentially sitewide, regulated claims require qualified review, and submissions/publication exposure are not fully reversible. No domain default establishes an action's final risk or authority. Output-check signals in each row define verification and operational measurement; no signal implies guaranteed indexing, rank, rich results, sales or citations. Outcome experiments use 09, not a common arbitrary “30-day SEO test.”

## 5. Worked fully resolved assessment contract: CAP-URL-02

Purpose: identify contradictory declared canonical preferences within a duplicate candidate group so valuable landing pages are not consolidated blindly. Applicability: all archetypes, HTML and header-canonical resources; excluded when no permissible observation exists. Objective Protect; profile P+R, LIVE. Prerequisites: scoped URL identities, parseable responses and current canonical guidance K01 from 17.

Required sensors: raw HTTP/header/HTML collection and sitemap parser if claiming sitemap disagreement. Optional: renderer, authorized URL Inspection, CMS content identity. Required evidence: original/request/final URLs, redirect hops, response status, canonical locators and exact source revision; both observed declarations for any asserted conflict. A sitemap not fetched is unknown, not a conflicting omission.

Detection: resolve declared targets against the observed base; compare sitemap-included URL, header/HTML targets and redirect destination without merging identities. Diagnosis: test duplicates versus intentionally distinct variants, locale mappings, stale render/cache and different collection times. Output: a `canonical_signal_conflict` claim with per-signal evidence; any search-engine-selected canonical remains unknown without provider evidence. One differing declaration establishes disagreement, not harm.

Skills: candidate `seo.canonical-consistency@1.0.0`, lifecycle domain_specified (16); tools restricted to P/R. Candidate action: investigate intended representative page and prepare alignment recommendation. Forbidden: choosing a canonical by URL brevity, deleting variants, auto-editing tags or treating declared preference as engine adoption. Potential intervention risk is high for templates/variants; blast radius includes alternates, links and protected pages. No website approval or rollback applies to this assessment; an eventual actuator needs exact diff, Review/Expert Review and conditional recovery.

Verification: independent parser resolves the same declarations from artifact locators; golden fixtures cover HTTP headers, relative targets, multiple tags, raw/render disagreement and temporal mismatch. Measurement: reviewed precision/recall of conflict detection at duplicate-group grain; source coverage denominator is observed signals, not all site pages. Learning: expert corrections update a site-scoped candidate; a later indexing observation cannot retroactively alter this decision's inputs. Client/expert projections follow 20. Dependencies: CAP-URL-01, CAP-HTTP-01; conflicts with locale/variant consolidation are explicit dependencies on CAP-INT-02 and CAP-COM-03 when applicable.

## 6. Release validator obligations

Reject duplicate IDs, unresolved required references, cyclic hard dependencies, dimensionless metrics, unknown source authority mislabeled normative, missing abstention behavior and executable definitions without tool schemas/tests. Hard dependency DAGs must terminate in evidence or policy primitives; runtime feedback loops are events, not dependency cycles. Recommendations sharing asset scope are conflict candidates even across domains. Contract compilation produces an inspectable materialized definition and a diff for review; it is a future implementation requirement, not software created in this phase.
