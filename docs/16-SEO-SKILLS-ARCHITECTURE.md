# 16 — SEO Skills Architecture

Status: proposed governed release contract. No executable skill or agent runtime is installed by this document. Parent: [04](04-SKILLS-AGENTS-TOOLS.md), [11](11-AUTONOMY-AND-GOVERNANCE.md), [15](15-CAPABILITY-CONTRACT.md).

## 1. Skills are governed procedures

A skill combines **versioned domain knowledge + procedure + evidence requirements + validation + policy constraints + tests**. A prompt is at most one replaceable implementation detail. Strategy chooses why/what; a skill specifies a bounded way to investigate or act; an agent carries out that assignment; typed tools implement the actual capabilities. Skills do not hold credentials or create competing strategies.

Identity: `seo.<responsibility>` independent of model vendor, framework and author. The release key is skill ID + semantic version + content digest. Source changes always create a new digest and release; overwriting `1.0.0` is invalid. Major versions change meaning, output compatibility or authority surface; minor versions add compatible applicability/procedures; patches correct behavior without widening permissions. SemVer is not proof of safety: every release receives regression review. A permission increase requires explicit review even if an author incorrectly labels it a patch.

## 2. Release artifact

| Component | Mandatory content |
| --- | --- |
| Identity and accountability | ID, SemVer, immutable digest, schema version, owner, reviewer, timestamp, predecessor and capability IDs |
| Applicability | Platforms, engine/surface, business predicates, page types, supported languages, excluded situations, unknown behavior |
| Knowledge manifest | Exact source revision IDs, rule IDs, normative/observational/research/inference class, applicability and permitted use; 17 |
| Preconditions | Required evidence types, freshness, coverage, tenant/site scope, contradictions that block conclusions |
| Procedure | Ordered steps/branches, deterministic versus model tasks, tool schemas, stop/abstain conditions, budget and timeout limits |
| Output | Versioned observations/claims/recommendations schema, evidence locators, missingness and uncertainty; no arbitrary prose as sole result |
| Tool permissions | Exact capabilities/versions, input constraints, network/data scope, permitted effects and maximum cardinality |
| Safety | Risk ceiling, protected-asset checks, approval route, forbidden effects; read-only skills explicitly have empty website effects |
| Validation | Independent output validator, invariants, golden/negative fixtures, failure semantics and measurement protocol |
| Lifecycle | Refresh deadlines, review cadence, deprecation/revocation policy, compatible dependencies, replacement migration |
| Evaluation | Dataset/labels/splits, deterministic checks, model evaluation criteria, sample sizes/uncertainty and signed release report |

Global skill releases contain no tenant data. A tenant configuration pins the release and supplies constraints; it may narrow permissions, never mutate the shared release. Approved tenant-specific procedural variants require their own immutable releases and governance. Do not create one skill per taxonomy row by default; group procedures only when their inputs, authority and validators form a coherent unit.

Dependency edges are `requires_release`, `requires_rule`, `requires_tool_schema`, `produces_evidence_for` and `supersedes`. Only the first three govern executable dependency resolution; they must be acyclic. Lock the transitive dependency manifest at admission. A decision stores that manifest, not a mutable “current SEO skill” label.

## 3. Release, refresh and revocation

Lifecycle: draft → evaluated → approved → deprecated or revoked. `domain_specified` in the capability catalog means documented, not an approved skill. Promotion requires a named human accountable owner, domain review, policy review for authority changes and an independently produced evaluation report. The generating agent cannot approve its own release. A deterministic parser release need not involve an LLM at all.

Admission resolves an approved release and checks evidence, cost and applicability. Queue payloads pin its digest, allowed output schema, site scope and policy generation. Before each external read or write, the gateway rechecks revocation, source usability, tenant permission and budget. Before publishing a derived assessment, validate that the release remains eligible for that conclusion. Already collected artifacts may be retained under policy even if a revoked reasoner cannot publish new beliefs.

A revocation event invalidates dependent queued work, suspends matching active work at the next dispatch boundary and creates re-evaluation tasks for affected current beliefs/proposals. Historical decisions retain the original release and receive an attached invalidation notice; no historical rewrite. An unavailable revocation authority blocks new governed tool dispatch and current authoritative publication. A short-lived signed policy lease can permit bounded reads only under an explicit offline policy; the first slice does not use such a lease.

Deprecation records replacement ID, deadline, compatibility and allowed finish behavior. A replacement is not substituted under an existing approval: prepare a fresh work item/manifest, revalidate evidence and reassess authority. Revoked releases have no grace period for new effects. In-flight remote requests may still finish and require reconciliation. Source freshness is independent of software expiry: a technically compatible skill can be unsafe because its governing rule changed.

## 4. First read-only skill pack

Candidate versions below are `1.0.0-draft`, not approved software. All inherit the release artifact above, P/R profiles from 15 and the hard collection limits in 19. Every required source must be snapshotted with a digest before executable promotion. Allowed tools are explicit per procedure. Internal storage uses scoped domain commands, not arbitrary SQL.

| Skill ID / capabilities | Procedure and evidence contract | Output and validation | Negative fixtures |
| --- | --- | --- | --- |
| seo.public-discovery / CAP-CRW-01–04, CAP-SMP-01, CAP-HTTP-01 | Validate seed/scope; obtain applicable robots policy; admit seed/sitemap/link candidates within budgets; collect responses and provenance; reconcile frontier | `CrawlRunSummary`, `URLResource`, `Observation`; every admitted URL has one terminal/pending reason; tools: scoped HTTP, robots, sitemap, HTML parser | Private redirect, malformed XML, trap, interrupted run, robots unreachable, no sitemap |
| seo.render-parity / CAP-JS-01–08 | Select template samples/critical pages; use matched raw evidence; capture DOM under fixed viewport/time; compare critical content, links and metadata; classify blocked/timeout | `RenderObservation`, `ContentDelta`, technology hypotheses; independent locators and repeated mismatch check; tools: render observer and artifact parser only | SPA direct-load failure, harmless analytics error, bot challenge, ISR stale response, hydration removes content, unsupported POST data fetch |
| seo.directive-baseline / CAP-ROB-01–05, CAP-IDX-01 | Parse raw headers/meta and available render values; bind agent/platform rules; retain conflicts; assess technical eligibility only | Per-source directives, effective-rule explanation or unknown; golden parser cases; tools: artifact read, robots evaluator, typed directive analyzer | Blocked page hides noindex, multiple agents, PDF header, conflicting tags, no response body |
| seo.canonical-consistency / CAP-URL-01–05 | Resolve URL identities; extract declarations with base/hop context; compare observed signals; assess targets only when fetched; request variant/locale evidence before recommending consolidation | `CanonicalAssessment` as detailed in 15; deterministic target resolution with independent parser; tools: scoped artifacts/graph, bounded missing-target HTTP fetch | Query-distinct product variants, relative canonical, malformed head, multiple tags, old sitemap, raw/render conflict |
| seo.business-twin-inference / CAP-BUS-01–05, CAP-AUD-01, CAP-MAP-01 | Read home/about/contact and representative offering evidence; extract literal claims; infer archetype and relationships; identify material questions without confirmation | Field-level `TwinRevision` with observed/inferred/disputed/unknown status; every offering/location has a locator; tools: scoped artifacts, model inference, schema validator | Footer agency, franchise, unsupported service radius, hybrid business, prompt injection, fabricated credentials |
| seo.site-structure / CAP-IA-01–05, CAP-LNK-01/05, CAP-DEM-05 | Extract resolved typed links, classify page roles/topics; build observed neighborhood; calculate scoped paths; mark orphan analysis unavailable without independent inventory | `GraphProjectionInput`, path witnesses, entity/topic hypotheses; edge endpoints/locators and coverage checked; tools: HTML/artifact parser, scoped graph, bounded inference | Partial crawl, repeated menu links, translated entities, JS-only links, orphan claim from link-only inventory |
| seo.initial-opportunities / CAP-MAP-04, CAP-TER-04/05, CAP-UX-01 | Read current Twin and findings; exclude unsupported business targets; select up to three material investigations/recommendations; preserve alternatives, missing data and no-action outcome | `OpportunityAssessment`, `DecisionRecord`, business cards; each rationale entailed by evidence and no projected revenue without source; tools: scoped retrieval, bounded inference, rule validator | No defects, uncertain location, disconnected GSC, duplicate findings, easy irrelevant keywords, recommendation mislabeled deployed |
| seo.reliability-gate / CAP-AUDIT-01–05, CAP-MEM-03 | Evaluate run coverage, source/skill validity, spend and projection/tenant integrity before publishing; persist check receipts | Scoped `ReliabilityAssessment`; deterministic deny/degrade results; tools: registry/ledger read, quarantine/reduce authority | Revoked skill during run, cross-tenant edge, stale policy cache, missing artifact, budget overrun, failed audit sensor |

These eight skills can run sequentially or as bounded workflow activities where dependencies allow. This is a future system design, not an instruction to spawn agents during documentation. Separate parsing, inference and final validation prevents one model output from being its own only evidence.

## 5. Future skill packs and authority separation

Connected search skills consume GSC/Bing/SERP evidence; local/commerce/international packs add domain predicates from 18; authority/AI-search packs require rights and sampling contracts. Evaluator skills consume frozen exposures/outcomes. Actuator skills are separate from diagnostic skills, even when both reference the same SEO rule. A title diagnosis skill cannot gain write access merely because a title actuator is installed.

Before adding any future executable pack, materialize its relevant rows from 14, pin all sources, define input/output schemas, supply counterexample fixtures and prove tool scope. Unresolved feature-specific guidance is a release blocker, not a reason to invent a generic best-practice rule.

## 6. Evaluation and promotion requirements

Deterministic fixtures require exact expected parsed values, scope and abstention statuses. Critical negative authorization, provenance fabrication and false website-action status fixtures permit zero failures. Extraction/classification quality is evaluated separately by page type, language, render mode and archetype; a high average cannot hide failure on a supported cohort. If a cohort lacks adequate labels, exclude it or mark inference provisional.

For the first pack, require all enumerated critical fixtures to pass, 100% output-schema validity on the acceptance corpus, 100% evidence-locator resolution for published factual claims, and no unsupported rankings/conversion claims. Set statistical precision/recall thresholds and corpus sizes in Phase 3 before evaluating candidate models; these must not be chosen after seeing results. These conditions are proposed gates, not passed tests.

Model replacement pins a new adapter/config release and reruns task-specific evaluations, privacy routing and injection cases. A skill may support multiple tested providers; a fallback without the required output reliability returns failure/abstention. Test data contains synthetic or licensed/de-identified records under explicit scope. Separate training/tuning fixtures from held-out release fixtures and rotate the latter to detect benchmark gaming. A frozen result report records cost, latency, error cohorts, source age and reviewer decisions alongside quality.
