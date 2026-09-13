# 08 — Domain Model

Status: proposed domain contract. Parent requirements: 00–06; findings: [07](07-ARCHITECTURE-READINESS-REVIEW.md). Temporal semantics are defined in [10](10-EVENT-AND-TEMPORAL-MODEL.md), authority in [11](11-AUTONOMY-AND-GOVERNANCE.md).

## 1. Distinct responsibilities

| Concept | Owns | Must not become |
| --- | --- | --- |
| Brain | Persistent closed-loop coordination over domain state, objectives, beliefs and outcomes | One model, chat transcript, autonomous superuser or new source of facts |
| Strategy | Objective trade-offs, opportunity selection, ordered plan revisions and allocation of budgets | Scheduler or independent strategy per specialist |
| Skills | Versioned SEO knowledge, bounded procedures, required evidence and validations | Mutable prompts with unrestricted permissions |
| Agents | Bounded reasoning or computation for a work assignment | Owners of tenant policy, credentials or final priority |
| Tools | Typed, scoped read/write capabilities with verifiable effects | Arbitrary shell/browser/network authority |
| Sensors | Scheduled/event-driven observations and their coverage/health | Decision makers or mutation shortcuts |
| Memory | Retrieval of historical observations, beliefs, decisions and outcomes | A vector store that defines truth |
| Knowledge Graph | Typed relations between domain entities, expressed as traceable assertions | Unproven similarity links promoted to facts |
| Evidence | Source artifacts, observations and derivation lineage | Explanations manufactured after a decision |
| Actions | Approved change intent, deployment attempts, receipts and compensation | A model's claim that it performed work |
| Evaluation | Frozen tests, verification results, outcome estimates and reliability measurements | The experimenting agent grading itself |
| Policy/Risk | Capability limits, risk decisions, approvals and stop controls | A suggestion the agent can ignore |

The Brain is the coordinated system of these responsibilities. It is not an extra database containing competing copies of them.

## 2. Identity and ownership

All tenant-owned records carry `tenant_id`; identifiers are opaque and stable. Relationships between tenant-owned records include tenant identity in their constraints. IDs never constitute authorization.

| Aggregate / owner | Meaning and cardinality | Important invariant |
| --- | --- | --- |
| Tenant / access | Billing and isolation boundary; many memberships, businesses and sites | Cross-tenant collaboration uses explicit memberships, not shared domain records |
| Membership, RoleGrant / access | Principal's scoped permissions and expiry | Viewing, approving, deploying, administering and support access differ |
| Business / Twin | Real organization or operating unit; belongs to one tenant | Domain names do not identify a tenant or legal entity |
| Site / asset registry | Managed web presence; business may have many sites | Same public URL in two tenants does not share private records |
| SiteScope / asset registry | Origins, path scopes, environments and verified control proofs | Broader origin scope cannot be inferred from a narrower grant |
| SearchProperty / integrations | Google/Bing or other provider property identity and permissions | Provider property and Site are mapped explicitly, potentially many-to-many |
| ConnectorConnection / integrations | Provider/account/grants, capability manifest, credential reference and health | Secrets live outside prompts and domain payloads |
| DeploymentTarget / execution | CMS/repository/environment/branch and allowed resources | Read connection does not imply write permission |
| URLResource / inventory | Original URL, normalized lookup key, origin and normalization version | Canonical suggestions never destroy distinct URL identities |
| PageIdentity, PageRevision / inventory | Optional durable CMS/content identity and immutable observed revisions | Redirects, aliases and canonical relations can change over time |

Normalize URLs conservatively: retain path case and meaningful parameters; record fragments and their handling; do not equate HTTP/HTTPS, trailing-slash variants or query permutations without scoped rules. A canonical is an assertion, not an identity merge. Entity merges/splits are versioned resolutions with reversible aliases and lineage.

## 3. Digital Business Twin

The Twin is a versioned collection of claims about offerings, audience segments, problems, service areas, languages, business model, conversion goals, constraints, brand rules, protected assets and confirmed priorities. It is not an LLM summary blob.

A `TwinRevision` references field-level claim IDs, schema version, previous revision, accepted corrections and unresolved questions. Each material field is confirmed, observed, inferred, disputed or unknown. `BusinessConstraint` may express “do not change pricing,” “do not imply service in an unserved city,” or “protect this converting page.”

URL onboarding produces a provisional revision. Ask only when uncertainty changes a material recommendation or authorization. Confirmation of an offering by the customer is evidence about their business; it is not evidence that a search engine ranks the offering.

An inferred location must not permit publishing a location page. A new customer correction creates a new revision, invalidates affected recommendations, and preserves the historical record.

## 4. Search world and graph ontology

| Entity | Required context |
| --- | --- |
| Offering, AudienceSegment, Problem, BusinessLocation | Business ownership and Twin claim lineage |
| Topic, SearchEntity, Intent | Language, ontology version, classification provenance |
| Query | Exact query text and language; semantic cluster is a separate assertion |
| SearchContext | Engine/surface, country or locality, language, device, time and collection method |
| DemandEstimate | Query/topic/context, period, units, source, uncertainty and coverage |
| SERPSnapshot, SearchResult | Query/context/time, observed result type, position semantics, provider and artifact |
| Competitor | Observed competing entity/site for a context; not necessarily commercial competition |
| LinkObservation, Mention | Source/target, observed time, extraction method and evidence |
| MetricDefinition, MetricObservation | Versioned grain, unit, denominator, aggregation, source window and completeness |
| TerritoryAssessment | Offering × intent/topic × geography × language × surface and assessment period |
| ProtectedAsset | Page/cluster, value evidence and constraints on permissible change |

Example edge predicates: `business_offers`, `serves_location`, `audience_has_problem`, `query_expresses_intent`, `page_addresses_intent`, `page_links_to`, `declares_canonical`, `observed_in_result`, `competes_for`, `action_targets`, `evaluation_measures`.

Every semantic edge is backed by an `Assertion` with subject, typed predicate, object/literal, scope, valid time, recorded time, evidence references and status. Derived traversals identify their derivation version. Similarity edges are explicitly `similar_to`, never automatically `same_as`.

Do not materialize every possible query-page pair. Store observed or deliberately inferred relationships; compute bounded derived neighborhoods on demand.

## 5. Opportunity and strategy model

Territory states from 05 are assessments, not exclusive ownership rights. Keep `Unknown` as an additional epistemic state when coverage is insufficient. “Owned” means valuable observed visibility in a declared period/context under a versioned rule, not permanent dominance. Reassess on expiry and material changes.

An `Opportunity` contains objective class (Understand/Grow/Protect), target territory/assets, problem statement, supporting and opposing claims, hypothesis, business relevance, expected benefit range, costs, time-to-signal, confidence basis, dependencies, protected-asset impact and expiry. Missing demand/value is unknown, not zero.

A `PriorityAssessment` records algorithm/version, inputs, constraint exclusions, uncertainty, alternatives and rationale. Initial ranking should use explicit feasibility filters and inspectable weighted comparisons; do not invent a universal “SEO score.” Weights and value proxies need archetype-specific validation. Account for overlapping opportunities to avoid double-counting benefit.

A `StrategyRevision` belongs to a business/site portfolio and contains goals, protected constraints, selected and deferred opportunities, budgets, horizon, success measures and a plan DAG. A `PlanStep` references skill requirements, dependencies, asset scopes, stopping criteria and expected evidence outputs. Cross-site dependencies require access to every involved site.

Strategy updates compare the expected prior revision. One accepted revision controls a scope; other agents submit proposals. Replanning explicitly supersedes affected steps and approvals rather than mutating an executing plan.

## 6. Execution, evaluation and continuity entities

| Aggregate | Essential records |
| --- | --- |
| BrainCycle | Trigger, scope, input watermark, Twin/strategy versions, decision outcome, next wake condition |
| DecisionRecord | Evidence/claim manifest, alternatives, rationale summary, policy result, uncertainty and selected next step |
| SkillRelease | Procedure and knowledge dependency hashes, I/O schemas, permitted tools, validations, lifecycle status |
| AgentRun | Assignment, budgets, skill/model/config versions, structured outputs and tool request references |
| WorkItem | Durable workflow state, deadlines, retries, cancellation and deduplication identity |
| ActionProposal | Immutable exact target/change, preconditions, expected effects and verification/compensation plan |
| PolicyDecision, ApprovalGrant | Versioned decision plus bounded authority for an exact proposal |
| DeploymentAttempt | Capability invocation, resource version, idempotency key, receipt and observed post-state |
| VerificationRun | Independently observed technical results linked to deployment |
| ExperimentDefinition, ExposureRecord | Frozen baseline/design/evaluation and actual treatment exposure |
| EvaluationResult | Dataset revisions, method, uncertainty, confounders and conclusion |
| LearningCandidate, LearningRelease | Evidence-scoped update and independently accepted promotion |
| AuditEvent | Actor, operation, scope, versions, outcome and correlation IDs |

Referential integrity must prevent an approval, receipt or evaluation from silently attaching to a different proposal revision. Domain records remain authoritative; indexes, graphs, embeddings and client cards are rebuildable projections.

## 7. Worked thread

A fictional plumbing business confirms emergency service in one city. A raw crawl observes a title; a rendered crawl observes a different title. These become separate observations, followed by a disputed consistency claim. The Twin provides confirmed service boundaries. An opportunity proposes restoring consistency on one eligible page, subject to protected-asset review.

Strategy selects investigation before mutation. A bounded technical agent uses a pinned skill to prepare the exact proposed title and before-state. Policy requires Review. Approval binds that proposal. The Action Engine conditionally applies it and a separate fetch verifies the result. Later search data supports an observational outcome, potentially inconclusive. Learning adjusts only the relevant site's confidence; it does not turn the edit into a universal rule.
