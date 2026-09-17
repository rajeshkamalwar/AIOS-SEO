# 35 — Quality Self Audit Gates

Status: fixed first-slice acceptance criteria, not passed runtime tests. Checks consume persisted ledger facts. They do not accept a model's self-assessment as evidence.

## Publication transaction

Construct frozen bundle and candidate outputs. Evaluate schema, scope, evidence, temporal, freshness, support, policy, budget and coverage gates. Write independent receipts and publication pointer atomically. A missing receipt cannot be interpreted as pass. Current revoked/deleted dependencies are rechecked before pointer commit. A failed required gate suppresses affected conclusions; independent supported observations may publish as partial. Tenant/policy integrity failure quarantines the entire affected publication. Failure of self-audit itself blocks publication.

Q01 schema: every output matches its local registered schema, no coercion or unknown properties. Q02 scope/provenance: every factual/inferred claim resolves authorized evidence and exact locators; 100% required. Q03 authority: zero forbidden calls, fabricated metrics or unauthorized state changes. Q04 temporal: no input beyond cutoff; no current claim past its freshness deadline. Q05 coverage: frontier accounting equality with disjoint sets; every absence claim has sufficient observation coverage. Q06 release: eligible current generation plus pinned digest and independently approved release. Q07 interpretation: numbers/uncertainty/lifecycle preserved; no unsupported business impact. Q08 durability: duplicate delivery/restart/lease expiry cannot duplicate acceptance or admit stale work.

## Twenty-two self-audit rules

[quality-gates.json](../spec/quality-gates.json) specifies each check's measured signal, comparator, failure effect and recovery evidence. Signal names are deterministic query results, never LLM ratings. Missing required signal yields unknown with the same restrictive effect as fail. Optional unavailable connected sources yield degrade and dependent abstention, never a fabricated defect. A14–16 are not_applicable in the first slice because there is no executing growth strategy, experiment or deployment; required=false does not make them healthy.

A01/A04/A05/A09/A10/A17 degrade dependent conclusions. A02/A07/A08/A11 reject affected stale/invalid outputs. A03/A12/A13/A18/A19/A20/A21/A22 quarantine inconsistent work. Recovery requires a new passing receipt and operator-reviewed resumption; the agent cannot lift its own quarantine or alter the rule version. All22 checks need a failure/unknown and recovery fixture before full slice release, including the disabled future checks rejecting fabricated activity.

## Frozen evaluation protocol

Public fixtures in36 are conformance examples, not held-out model evaluation. Before testing any candidate model for release, evaluation owner assembles and hash-freezes100 pages per supported cohort (English local service, marketing SSR, SPA, commerce, publisher, hybrid), at least30 positive and30 counterexample cases per task where applicable. At least200 labeled claims/cohort for extraction. Two independent labelers adjudicate disagreements; abstention/unsupported labels remain explicit. Keep separate tuning and held-out origins/templates. No tuning on held-out failures; a new trial needs a new untouched split/report. Unlabeled cohorts remain provisional and cannot be advertised as validated.

Per cohort: factual extraction precision≥0.98 and recall≥0.85; page/archetype classification macro-F1≥0.90; material technical finding precision≥0.95 and recall≥0.85; evidence resolution/schema/critical authority cases100%; unsupported ranking/revenue/causality claims0. Report sample sizes, abstention rate and Wilson95% intervals for precision/recall alongside point estimates; thresholds apply to point estimates and never imply a probabilistic guarantee. Independent business review must find≥90% of proposed next steps relevant in a sample of50/cohort; unsupported next steps fail Q02 regardless of average.

Operational metrics: proportions carry numerator/denominator and unit=ratio; denominator0 means unknown, never value0. Latency uses milliseconds, cost uses integer microusd. Crawl coverage numerator observed, denominator admitted; it is not whole-site coverage. Model changes rerun relevant frozen suites, adapter/privacy and injection cases. No outcome learning promotion or Auto grant follows from these read-only quality gates.
