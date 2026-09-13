# 07 — Architecture Readiness Review

Status: proposed architecture and implementation gates; not approval to scaffold or deploy.
Review baseline: commit `00609f66066da380fa1714aa584d944abb1e41fe`.
Read completely: [AGENTS.md](../AGENTS.md), [README](../README.md), and all seven existing documents, 00–06, in numerical order. The recursive repository inventory contained no other Markdown documents or nested agent instructions.

## 1. Verdict

The product identity is sufficiently defined. The implementation foundation is not. The repository defines an unusually useful direction: a persistent, domain-native Search Growth Brain whose reasoning changes with evidence and outcomes. It does not yet define executable contracts, operating limits, acceptance criteria, or the authority to modify a customer's assets.

Do not replace this vision with a dashboard, chatbot, website builder, competitor feature catalogue, or independent SEO automations. Conversely, do not treat naming fourteen functional layers and many agents as proof that an architecture exists. Their identities, information contracts, ownership, failure semantics, and governance boundaries must be defined.

Documents 08–13 propose those foundations. They do not silently amend the constitution or assert that unresolved decisions have been accepted. Conflicts with 00–06 require an explicit architecture decision record (ADR). The product owner owns constitutional changes; engineering owns enforceable contracts after acceptance.

## 2. What is already sufficiently defined

| Canonical source | Defined requirement | Architectural consequence |
| --- | --- | --- |
| 00, AGENTS 1–4, 18 | Understand, grow, protect, learn; search-specific scope | Every work item declares a search objective and business beneficiary |
| 01 | URL-first, progressive integrations, continuous cloud operation | Provisional discovery works without private data; durable state survives sessions |
| 02 | 32 eventual capability families | Capability roadmap, not 32 independent products or mandatory first-release services |
| 03–04 | Strategy owns why/what; agents execute bounded work | One versioned strategy authority per scoped portfolio; agent proposals cannot redefine goals |
| 00, 04–05, AGENTS 6–12 | Governed skills, explicit tools, evidence, risk, verification | Independent enforcement around tool execution, not a safety prompt |
| 06 | Mobile-first business interpretation; real graph | Shared domain APIs with business projections and evidence-backed expert exploration |

## 3. Contradictions, tensions, and omissions

Severity: P0 blocks the relevant foundation or all external writes; P1 blocks the named capability; P2 is an explicit later design gate. A tension is not automatically a contradiction.

| ID / severity | Source and finding | Failure if ignored | Stronger resolution / owner |
| --- | --- | --- | --- |
| R01 / P0 | 00's total truth hierarchy conflates normative guidance with observed facts | A guideline could override a real failure, or one experiment could excuse spam | Apply source precedence by claim type and applicability; preserve contradictions (09). Product + SEO lead approve clarification |
| R02 / P0 | 01 URL-first inference does not define ownership or consent | Entering a competitor URL grants apparent mutation rights | Provisional public discovery is distinct from verified asset control and explicit capability grants (08, 11). Security + product |
| R03 / P0 | 03/04 name Strategy Brain and Orchestrator without concurrency ownership | Multiple workers issue incompatible plans | Strategy revisions use optimistic concurrency; scheduling owns delivery, not priorities (08, 10). Engineering |
| R04 / P0 | 05's lifecycle combines investigation, action, and experiments | A proposal can appear deployed or successful without evidence | Separate decision, deployment, technical verification, measurement, and learning state machines (10). Engineering |
| R05 / P0 | “Preferably reversible” and Auto leave irreversible effects unspecified | A retry duplicates a write; reversal overwrites later human edits | Typed capabilities, preconditions, unknown-outcome reconciliation, conditional compensation; no ranking-restoration promise (11). Security + execution lead |
| R06 / P0 | Tenant isolation versus 03's “reusable priors” | Customer pages, prompts, embeddings, or performance leak across tenants | Site learning stays tenant-local; global priors need a separately approved, privacy-tested promotion process (09, 11). Security + product |
| R07 / P0 | 04 skills have versions but no release or revocation contract | An old queued job executes withdrawn guidance | Immutable releases, dependency manifests, freshness deadlines, revocation checks at execution (09, 11). SEO + platform |
| R08 / P0 | Confidence, risk, blast radius, reliability are named but uncalibrated | An LLM invents 95% confidence and approves itself | Evidence sufficiency and independent hard policy gates; empirical calibration before Auto (11, 13). Evaluation owner |
| R09 / P1 | 05 “controlled change” assumes separable treatment | Seasonality, algorithm changes, internal-link spillovers, and concurrent edits create false learning | Frozen designs, exposure records, interference checks, inconclusive outcomes; observational results remain associational (09). Evaluation owner |
| R10 / P1 | 03 “graph” and “memory” lack entity, edge, and temporal semantics | An attractive graph becomes untraceable assertions | Stable identities, evidence-bearing assertions, bitemporal history, bounded projections (08–10). Domain lead |
| R11 / P1 | 01 discovery promises competitors, customers, demand from one URL | Guesses become authoritative business facts | Inferred Twin fields carry provenance; material ambiguity triggers a targeted question (08–09). Product |
| R12 / P1 | 02 assumes broad platform visibility without contracts | Missing API rows become zero demand; submission becomes “indexed” | Connector capability/coverage manifests and explicit unknown states (09, 12). Integrations lead |
| R13 / P1 | 03 heartbeat and parallelism have no workload envelope | Runaway crawl/model spend, duplicated investigations, starvation | Coalesced triggers, per-site budgets, work admission, deadlines, priority lanes (10, 12). Platform |
| R14 / P1 | 04 Policy Guardian is also an agent | Prompt injection or shared model error approves malicious content | Deterministic enforcement outside agents; untrusted content never carries authority (11). Security |
| R15 / P1 | 06 business impact and “owned” territory lack metric definitions | False revenue attribution and permanent ownership claims | Versioned metric/territory definitions, denominators, cohorts, uncertainty and expiry (08–09). Product + analytics |
| R16 / P1 | No deletion, residency, credential, recovery or support model | Durable memory becomes undeletable sensitive data | Classification, deletion propagation, scoped support access, restore drills and SLO decisions (11–13). Security + operations |
| R17 / P2 | Every family and specialist appears equally ready | Premature microservices and generic agent theatre | Logical modules now; add a specialist only for a bounded, evaluated workload (12–13). Architecture owner |

## 4. Hidden assumptions to reject

- A website is not necessarily one business, tenant, locale, property, or deployment target. An agency can access multiple businesses; a business can own several sites.
- “Search presence” is not a single complete dataset. Each sensor has an observation window, sampling context, permissions and missingness.
- A headless browser observation is not proof of what a search engine rendered or indexed.
- A site without analytics can receive useful technical/search recommendations; measured revenue contribution must remain unavailable.
- A technically correct edit can harm an existing winning asset. Protection constraints outrank speculative growth.
- A successful API response does not prove deployment, crawl adoption, indexing, visibility, or business gain.
- Long-running reasoning must not mean a permanently running LLM conversation. Durable domain state, event history and scheduled work provide continuity.
- A customer asking for more traffic does not authorize all possible content or infrastructure changes.
- A graph database, vector database, agent framework, and message broker are not prerequisites simply because the product contains graph, memory, agents, and events.

## 5. Readiness gates and counterexamples

| Gate | Required proof before implementation of capability |
| --- | --- |
| Domain foundation | Tenant/business/site identities, authority boundaries, module ownership and schema evolution accepted |
| Evidence foundation | Two conflicting observations retained; as-known-then query excludes later data; missing rows cannot become zeros |
| Read-only Brain | One persisted decision can be reconstructed from its evidence, Twin, strategy, skill and model versions |
| First write | Unauthorized scope denied; stale approval invalidated; crash after remote write reconciled without duplicate application |
| Auto | Skill/connector/risk cohort meets frozen reliability gates; revocation and stop controls work independently of LLM |
| Learning | Evaluator cannot rewrite the frozen experiment; sparse/confounded evidence yields inconclusive |
| Client | Mobile user understands proposed change, affected assets, uncertainty and authority requested |
| Graph | Each visible semantic edge opens a real assertion and evidence; inferred edges are clearly distinguished |

The immediate blockers are the decisions in 13, not a lack of frontend scaffolding. Physical-schema, connector and policy contracts should follow acceptance of these proposals. No current document establishes production capacity, security certification, complete SEO coverage, or causal efficacy.

## 6. Review scope and limits

This is a document-grounded architecture pass. No application exists in the reviewed snapshot; no code, integrations, production data, workload measurements, or customer interviews were available to validate feasibility. Technology recommendations in 12 are conditional and tied to explicit validation gates. External sources there substantiate limited platform facts, not the proposed product design.
