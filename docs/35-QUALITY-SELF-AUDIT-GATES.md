# 35 — Quality Self Audit Gates

Status: fixed first-slice acceptance criteria, not passed runtime tests. Checks consume persisted ledger facts. They do not accept a model's self-assessment as evidence.

## Publication transaction

Construct frozen bundle and candidate outputs. Evaluate schema, scope, evidence, temporal, freshness, support, policy, budget and coverage gates. Write independent receipts and publication pointer atomically. A missing receipt cannot be interpreted as pass. Current revoked/deleted dependencies are rechecked before pointer commit. A failed required gate suppresses affected conclusions; independent supported observations may publish as partial. Tenant/policy integrity failure quarantines the entire affected publication. Failure of self-audit itself blocks publication.

Q01 schema: every output matches its local registered schema, no coercion or unknown properties. Q02 scope/provenance: every factual/inferred claim resolves authorized evidence and exact locators; 100% required. Q03 authority: zero forbidden calls, fabricated metrics or unauthorized state changes. Q04 temporal: no input beyond cutoff; no current claim past its freshness deadline. Q05 coverage: frontier accounting equality with disjoint sets; every absence claim has sufficient observation coverage. Q06 release: eligible current generation plus pinned digest and independently approved release. Q07 interpretation: numbers/uncertainty/lifecycle preserved; no unsupported business impact. Q08 durability: duplicate delivery/restart/lease expiry cannot duplicate acceptance or admit stale work.

## Twenty-two self-audit rules

[quality-gates.json](../spec/quality-gates.json) specifies each check's measured signal, comparator, failure effect and recovery evidence. Signal names are deterministic query results, never LLM ratings. Missing required signal yields unknown with the same restrictive effect as fail. Optional unavailable connected sources yield degrade and dependent abstention, never a fabricated defect. A14–16 are not_applicable in the first slice because there is no executing growth strategy, experiment or deployment; required=false does not make them healthy.

A01/A04/A05/A09/A10/A17 degrade dependent conclusions. A02/A07/A08/A11 use `reject_outputs` for specifically affected stale/invalid outputs and all transitively dependent conclusions. Independent outputs may proceed only when their own required gates pass. Unknown or incomplete affected scope escalates to `quarantine_run`. A03/A06/A12/A13/A18/A19/A20/A21/A22 use `quarantine_run` for integrity failures. Recovery requires a new passing receipt and operator-reviewed resumption; the agent cannot lift its own quarantine or alter the rule version. All22 checks need a failure/unknown and recovery fixture before full slice release, including the disabled future checks rejecting fabricated activity.

## Frozen evaluation protocol

Public fixtures in36 are conformance examples, not held-out model evaluation. Before testing any candidate model for release, evaluation owner assembles and hash-freezes100 pages per supported cohort (English local service, marketing SSR, SPA, commerce, publisher, hybrid), at least30 positive and30 counterexample cases per task where applicable. At least200 labeled claims/cohort for extraction. Two independent labelers adjudicate disagreements; abstention/unsupported labels remain explicit. Keep separate tuning and held-out origins/templates. No tuning on held-out failures; a new trial needs a new untouched split/report. Unlabeled cohorts remain provisional and cannot be advertised as validated.

Per cohort: factual extraction precision≥0.98 and recall≥0.85; page/archetype classification macro-F1≥0.90; material technical finding precision≥0.95 and recall≥0.85; evidence resolution/schema/critical authority cases100%; unsupported ranking/revenue/causality claims0. Report sample sizes, abstention rate and Wilson95% intervals for precision/recall alongside point estimates; thresholds apply to point estimates and never imply a probabilistic guarantee. Independent business review must find≥90% of proposed next steps relevant in a sample of50/cohort; unsupported next steps fail Q02 regardless of average.

Operational metrics: proportions carry numerator/denominator and unit=ratio; denominator0 means unknown, never value0. Latency uses milliseconds, cost uses integer microusd. Crawl coverage numerator observed, denominator admitted; it is not whole-site coverage. Model changes rerun relevant frozen suites, adapter/privacy and injection cases. No outcome learning promotion or Auto grant follows from these read-only quality gates.

## Receipt and transition contract

[ADR-007](decisions/007-audit-effect-scope.md) is accepted. Rules 1.1.0 carry effect scope. New SelfAuditResult receipts use schema_version 2 with direct_output_ids, affected_output_ids (complete transitive closure including roots), dependency_snapshot_hash, scope_complete and scope. IDs resolve to same-tenant/site/run outputs. A complete snapshot covers the entire candidate set and every dependency; it is generated from accepted records, never asserted complete by an agent. Cycles, missing nodes, foreign references or unverifiable completeness fail closed. Even a passing signal cannot make an unknown scope publishable. A `pass` receipt does not erase prior rejection/quarantine: a distinct evaluator receipt referring to the previous receipt and operator-reviewed recovery are required. Revocation checks remain synchronous at admission, dispatch and acceptance.

The deterministic transition fixtures in [audit-transitions.json](../spec/fixtures/audit-transitions.json) exercise failure, unknown, impact propagation, independent outputs, incomplete scope and recovery for all checks; they are conformance fixtures, not model evaluations.

## Current input restrictions

A frozen evidence cutoff does not freeze permission to use evidence. Perception consumers recheck current persisted output impacts for every actual input, including accepted source observations/artifacts, bundles and parent records. A same-site restriction cannot be bypassed by starting a new run. Independent unaffected inputs may continue through their remaining gates; current-run integrity or incomplete impact scope fails closed.

A passing recovery receipt must be distinct, later, version-matched, explicitly linked to the restricted receipt and separately operator-reviewed. It does not clear a work fence by itself. Independently governed recovery evaluation remains possible while processing is quarantined; a specifically rejected recovery witness cannot restore permission. Consumer checks and governance writes must serialize at the same commit boundary. These input checks supplement publication gates and do not establish that missing required publication receipts passed.
