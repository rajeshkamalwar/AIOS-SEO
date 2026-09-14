# 09 — Evidence and Truth Model

Status: proposed clarification of 00's truth hierarchy. Acceptance is required; this document does not silently override the constitution.

## 1. Evidence, claim, belief and decision differ

Evidence is what was obtained, under what conditions. A claim is an interpretation or assertion supported or contradicted by evidence. A belief is the system's scoped, time-dependent assessment of a claim. A decision uses beliefs, business objectives and policy; it does not make those beliefs true.

| Record | Minimum contract |
| --- | --- |
| Source | Identity/URI, publisher, source class, authority scope, access classification and permitted retention/use |
| EvidenceArtifact | Tenant or approved global scope, object reference, content hash, MIME type, captured time, redaction/retention metadata |
| Observation | Subject, sensor/version, source request context, artifact locator, observed/received times, window, status and coverage |
| Claim | Subject/predicate/object or typed value, unit, context, applicability, valid interval and claim kind |
| EvidenceLink | Claim, observation/claim dependency, supports/contradicts/qualifies relation and extraction locator |
| Derivation | Input IDs/hashes, transformation or skill release, model/config where applicable and output schema |
| BeliefRevision | Claim, assessed status, uncertainty, assessment method/version, known-at cutoff and supersession lineage |
| DecisionEvidenceManifest | Exact belief/evidence revisions available for a decision, missing inputs and policy-relevant freshness |

An artifact hash proves content identity, not factual correctness. An LLM-generated citation is not provenance until the cited source exists and the quoted or extracted assertion is checked. Preserve minimal necessary artifacts subject to rights and retention; a URI alone cannot reconstruct a changing source.

## 2. Applicable authority, not one global scalar

| Claim kind | Preferred authority | Conflict rule |
| --- | --- | --- |
| Platform requirement / prohibited practice | Applicable current official platform guidance | Bind by platform, scope and effective date; block disputed safety-relevant execution |
| What a server returned | Direct observation with request context | Guidance cannot override a measured response; raw/rendered/time differences may explain disagreement |
| What a provider reports | Authorized provider observation | Preserve reporting period, definitions and limitations; do not extend beyond provider coverage |
| Business offering / constraints | Authorized customer confirmation and supporting business records | Conflicting public content triggers clarification, not silent overwrite |
| Effect of an intervention | Suitable experiment with independent evaluation | Applicability and confounding determine evidential strength; it cannot authorize prohibited tactics |
| General SEO heuristic | Relevant research and evaluated experience | Scope as provisional knowledge, below applicable platform constraints |
| Predicted opportunity or explanation | Explicit inference with traceable inputs | Never present as observed fact or execution authority |

This retains the constitution's preference for official and first-party evidence while resolving R01. A factual observation may contradict expected behavior without contradicting the governing rule.

Belief states: `unknown`, `supported`, `disputed`, `refuted`, `stale`, `superseded`. “Supported” means sufficient for the declared use, not metaphysical certainty. Multiple plausible hypotheses can coexist. Source agreement is not independent corroboration when sources copy the same upstream dataset.

## 3. Freshness, missingness and confidence

Every claim type has a proposed freshness policy: observation cadence, maximum usable age by decision/risk class, invalidating events and required refresh method. A title observation and a business registration fact should not expire identically. Execution preconditions require a new target-state check even if supporting knowledge remains fresh.

Store missingness explicitly: `not_connected`, `not_observed`, `partial`, `redacted`, `quota_limited`, `failed`, `not_applicable`, `complete_for_declared_scope`. No rows is not automatically no traffic. Google's Search Analytics API explicitly does not guarantee every row and distinguishes finalized from incomplete recent data; store those limitations with the observation. [Google Search Analytics reference](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).

Confidence has separate components: source applicability, observation quality/coverage, identity-resolution certainty, inferential uncertainty and freshness. Action risk is separate. Do not average these into an unexplained number or accept a model's self-rating as calibrated probability. Where probabilities are shown, store cohort, calibration method, sample size and error; otherwise use qualified categorical assessments.

A disputed high-impact precondition blocks execution. A low-stakes discovery inference may be displayed with uncertainty. Unknown evidence triggers targeted observation, a customer question, deferment, or abstention.

## 4. Refreshable SEO knowledge and skills

The global knowledge registry contains public/licensed guidance and approved general knowledge, never tenant-private artifacts. A `KnowledgeSourceRevision` records canonical URL, publisher, retrieval time, publication/effective time if known, content hash, excerpt/locator, language, applicability and supersession relations.

Proposed update flow:

1. Schedule source checks by criticality; detect substantive changes and extraction failures.
2. Preserve permitted source revision and produce a structured semantic diff.
3. Identify affected rules, skill releases and pending proposals through dependency edges.
4. SEO reviewer evaluates applicability; independent policy/evaluation owners approve safety-sensitive changes.
5. Publish immutable knowledge and skill releases after regression checks.
6. Mark affected pending actions for revalidation; immediately revoke unsafe releases.
7. Keep previous versions for audit, subject to source retention rights.

A timestamp change alone is not a knowledge change. A missing source does not mean the guidance is revoked. Use `refresh_failed` and risk-based expiry; suspend dependent writes when required authority cannot be established.

Skill releases pin a knowledge manifest rather than “latest documentation.” Runtime resolves an approved release before a run, then execution checks revocation and policy freshness again. A new model or prompt does not silently update an SEO rule. Unknown publisher effective dates remain unknown.

## 5. Evidence-backed graph and memory

The graph stores assertions and their provenance; the Twin is a selected business projection over those claims. Memory exposes:

- Episodic: observations, actions and outcomes.
- Semantic: current and historical scoped beliefs and graph relationships.
- Procedural: approved skill and knowledge versions.
- Decision memory: what was selected, rejected, assumed and learned.

Retrieval filters tenant/access scope before ranking, then checks temporal applicability and freshness. Embedding similarity retrieves candidates; canonical records determine meaning and authority. Summaries retain evidence links and summarizer version, and cannot erase disagreements. Rebuilding an embedding index must not change the historical belief record.

Cross-tenant learning is disabled by default. A later global-prior pipeline needs authorized purpose, aggregation/de-identification controls, leakage tests, rights review and independent promotion. Public data encountered during a tenant crawl is still tenant-contextual work until separately admitted as a global source.

## 6. Verification, measurement and causal evaluation

Technical verification asks whether the intended asset changed correctly and protected invariants remain true. Outcome measurement asks what followed. Causal evaluation asks whether the action caused an effect. These are separate records and statuses.

Before exposure, freeze an `ExperimentDefinition`: hypothesis, treatment unit, eligible cohort, exclusions, baseline, primary metric/definition, guardrails, comparison method, observation window, minimum evidence, handling of missing/revised data, stopping rules, confounders, analysis version and approver. The experimenting agent cannot edit it after seeing results. A necessary change creates a new experiment/revision with explicit limits on comparability.

Possible outcomes: beneficial, harmful, no detectable effect, inconclusive, invalid. Low sample size is not failure or proof of no effect. Safety rollback may happen before statistical evaluation; record early stopping rather than claiming a completed experiment.

Search-specific confounders include seasonality, algorithm updates, competitor changes, demand shifts, indexing delay, conversion instrumentation changes and simultaneous edits. Internal links create interference between pages; choose clusters or suitable controls where possible. If randomized assignment is infeasible, label the method observational or quasi-experimental and state its assumptions. Do not invent precision by treating correlated query/day rows as independent samples.

Metric contracts must define qualified visibility and conversions for the chosen business archetype. Keep engine/device/location cohorts and compatible periods. Separate observed enquiries/sales from attributed or estimated contribution. Preserve denominators and avoid adding overlapping query/page aggregations. Revenue is unavailable without a valid source and definition.

## 7. Learning and self-audit

A `LearningCandidate` references the frozen evaluation, scope, evidence strength, proposed belief/strategy adjustment and known counterexamples. Independent evaluation validates it before a new `LearningRelease`. Site learning may change future priorities; it cannot rewrite prior decisions, relax platform policy, deploy a skill release or train a provider model implicitly.

Self-audit measures provenance coverage, freshness violations, contradiction backlog, calibration, unauthorized attempts, technical failure/compensation rates, missing measurements and model/skill drift. It can reduce autonomy or quarantine work through deterministic policy. Its own checks are versioned and evaluated by an independent owner.

Store decision rationale summaries and structured traces, not a requirement to preserve hidden model chain-of-thought. Reproducibility means reconstructing inputs and decisions; stochastic inference and changing external pages do not promise byte-identical reruns.
