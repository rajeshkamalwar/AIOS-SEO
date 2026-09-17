# 21 — Brain Self-Audit

Status: proposed deterministic reliability contract, extending 03/09/11. CAP-AUDIT-01–05 coordinate these checks; checks are not additional capability IDs. A Brain that cannot establish its reliability must reduce the scope of its conclusions and autonomy.

## 1. Independent reliability control

Self-audit consumes observed run/ledger/coverage/registry signals, not an agent's assurance that it succeeded. The policy service and audit runner have independently monitored heartbeats and least-privilege identities. A model may explain incidents; deterministic checks enforce stop conditions. The system cannot prove its own total correctness; untested dependencies and unknown health are explicit.

`AuditCheckDefinition` includes stable ID/version, scope, required telemetry, cadence/deadline, predicate, severity, suppression rules, allowed mitigation and recovery proof. `AuditFinding` includes check version, tenant/site/global scope, incident key, evidence IDs, first/last-seen, state, impact/dependent work, mitigation receipts, owner and resolution evidence. No secrets or full page/prompt payloads in operational telemetry.

Health is scoped: `healthy`, `degraded`, `quarantined`, `unknown`. The effective work permission is the intersection of dependency health and current policy; a global average cannot cancel a failed authorization boundary. Degraded evidence may support narrower observations, but not broader claims. First-slice external website authority is always none, even when every health check passes.

## 2. Check catalog

Initial thresholds are replaceable AIOS operating proposals. Source-specific deadlines and workload budgets come from released policy. “Immediate” means at the next enforced dispatch/publication boundary plus queued incident processing; it is not a guarantee of instantaneous cancellation of network requests.

| Check | Detection / evidence and cadence | Mitigation / recovery proof |
| --- | --- | --- |
| A01 Sensor health | Missing expected receipt, repeated error class or invalid output schema; every completion + daily overdue scan | Pause affected sensor/reasoning; bounded successful probe and schema-valid receipt restore coverage |
| A02 Evidence age | Referenced evidence exceeds decision-specific fresh_until or invalidating event; before analysis/publication | Refresh or mark stale; new matching observation required, not a timestamp edit |
| A03 Partial crawl | Frontier accounting mismatch or unfinished admitted work; checkpoints and completion | Quarantine inconsistent summary; otherwise publish partial counts; reconciled sets required |
| A04 Render failure | Timeout, policy-blocked resource, missing readiness or unmatched raw capture; each render | Preserve raw-only findings, suppress unsupported parity conclusions; matched successful repeat or declared limitation |
| A05 Connector coverage | Response finality/row coverage/scope differs from requested context; each import | Mark partial/unknown, prevent zero-fill; validated provider response with correct context |
| A06 Missing permissions | Token/grant expired, revoked or insufficient for property; at dispatch | Stop matching connection calls, one reconnect notice; current grant and verified property mapping |
| A07 Skill freshness | Source/rule review deadline expired; admission and publication | Suspend affected current conclusions; approved source/skill revalidation |
| A08 Skill revocation | Release/transitive dependency revoked; event + dispatch lookup | Immediately stop dependent admission/dispatch/acceptance; reject affected outputs and their transitive dependents; independent replacement/re-evaluation, no silent pin substitution |
| A09 Evidence insufficiency | Required fields/coverage/locators fail capability predicate; each assessment | Abstain or investigate; sufficient new manifest and validator receipt |
| A10 Contradictory evidence | Material mutually inconsistent claims in same applicable context; belief update | Preserve dispute; block dependent high-consequence recommendation; distinguishing evidence or explicit narrower conclusion |
| A11 Agent output failure | Invalid schema, unsupported claim or budget violation; every agent output | Reject affected outputs and transitive dependents; one bounded repair within budget, then failed/unknown; independently valid output |
| A12 Repeated task failure | Three consecutive same-class failures for same scoped work in one run; attempts ledger | Open circuit, quarantine and operator incident; classified root cause plus safe probe, no reset by renaming task |
| A13 Runaway cost | Reservation would exceed call/token/currency/request limit; before each work dispatch | Deny new discretionary work, complete accounting and publish partial state; explicit new budget policy/grant, not model override |
| A14 Stale strategy | Input invalidation, expired horizon or changed material Twin constraints; every plan dispatch + daily scan | Stop dependent steps and replan; expected-version accepted strategy, old plan retained |
| A15 Incomplete evaluation | Observation window + permitted data-lag deadline passed without valid result; scheduled timer | Mark overdue/inconclusive and prohibit learning promotion; completed frozen evaluator or documented invalidation |
| A16 Unresolved deployment | Attempt outcome unknown/partial or verification overdue; receipt events + reconciler | Freeze conflicting resource writes, reconcile remote state; verified state/compensation or explicit manual incident ownership |
| A17 Confidence calibration | Supported cohort lacks labels or measured errors exceed frozen bound; each evaluation release + periodic review | Report unknown/drift, downgrade authority; independently adequate held-out cohort evaluation |
| A18 Policy engine health | Missing signed version, stale heartbeat, denial service unreachable or inconsistent decisions; dispatch + independent probe | Fail closed for governed calls/publication; health restored and negative authorization probes pass |
| A19 Tenant isolation | Foreign-scope reference, object/graph/cache access or prompt contamination detected; access checks + scheduled fixtures | Quarantine affected tenant/work boundary; security incident review and scoped integrity/recovery proof |
| A20 Projection and lineage integrity | Unresolvable artifact, missing edge provenance or watermark inconsistency; publication + daily sampled reconciliation | Suppress invalid card/edge; rebuild from authorized canonical records and verify hashes/counts |
| A21 Refresh pipeline health | Source fetch/extraction failure, overdue source review, unreviewed changed prohibition; source runs | Mark affected knowledge unreliable, revoke if necessary; reviewed valid source revision and dependent checks |
| A22 Recovery/deletion integrity | Restore lacks deletion-ledger replay or artifact/key consistency; every restore, periodic drill | Keep restored system read-only/quarantined; deletion and external-effect reconciliation complete |

A03 distinguishes a valid partial crawl from a corrupt accounting summary. A04 distinguishes a site defect from AIOS policy-limited rendering. A05 distinguishes absent provider evidence from zero demand. These distinctions prevent self-audit from manufacturing SEO issues to make itself appear useful.

## 3. Incident lifecycle and downgrade rules

`detected → triaged → mitigating → monitoring → resolved`, with `acknowledged_unresolved` and `false_positive` requiring reasons. Acknowledgment does not restore authority. Every mitigation and recovery is a separate audited operation. Suppression has scope, owner and expiry and cannot suppress deterministic authorization blocks. Related findings share a root incident key to avoid 100 alerts from one expired connector.

| Failure scope | Permitted continuation |
| --- | --- |
| One optional sensor | Continue independent conclusions; explicitly mark dependent data unavailable |
| Required evidence or render source | Continue narrower supported observations; dependent diagnoses abstain |
| One revoked skill | Preserve raw artifacts; stop affected procedure and re-evaluate current derived beliefs |
| Tenant integrity/credential boundary | Quarantine affected processing and investigate; no cross-tenant fallback |
| Global policy/revocation authority | Stop governed dispatch and authoritative publication until independently checked |
| Unknown external deployment outcome (future) | Stop conflicting writes; independently authorized observation/reconciliation can continue |

A health recovery never grants higher autonomy than the pre-incident authorized ceiling. Auto promotion requires 11/13's separate evidence and approval; the self-audit agent cannot rewrite thresholds, approve a release or lift its own quarantine. Default recovery is operator-reviewed in the first slice. A later deterministic recovery policy may restore bounded read collection after a passing probe, explicitly versioned and independently approved.

## 4. Operational signals and audit limitations

Track sensor freshness/coverage, missed schedules, parse failures, unresolved disputes, invalid output rate, repeated failures, cost per site/cycle, policy denials, overdue strategies/evaluations, unresolved effects and evidence-locator resolution. Denominators and measurement windows are part of each metric. No labels means confidence calibration unknown; a low incident count can mean poor detection, not safety.

Audit output has verified defects, verification gaps, supported healthy scope and optional improvements, each with evidence. These classifications adapt the public AIS-OS audit mechanism discussed in 22. AIOS does not adopt a single 100-point readiness score: authorization, privacy and missing truth inputs cannot be averaged away.

Keep tenant business findings separate from operator infrastructure incidents. Customers receive only material consequences in plain language through 20, such as “We paused this recommendation while we recheck its evidence.” Operators receive exact affected work, check/policy versions and recovery requirements. Never notify customers that a deployment failed if the outcome is actually unknown.

## 5. Acceptance and independent failure injection

Before implementation release, exercise all 22 checks using synthetic fixtures. Include a failing audit sensor, stale revocation cache, false healthy connector response, adversarial page text, stuck retry loop, concurrent spend reservations, deliberately unresolvable graph edge and restore after deletion. Verify both mitigation and recovery, including attempted self-promotion denial. Runtime tests must be performed outside the agent under test; production incident reviews periodically challenge detector coverage. No tests or monitoring infrastructure are implemented by this document.

## Accepted effect scope

[ADR-007](decisions/007-audit-effect-scope.md) governs A02/A07/A08/A11: reject explicitly identified outputs and their complete transitive dependent set. Independent outputs still need every required gate. Unknown or incomplete affected scope quarantines the entire run/publication. Run integrity failures also quarantine the run. Agents cannot clear either restriction; independently passing recovery evidence and operator-reviewed resumption are required. Rule version 1.1.0 and SelfAuditResult schema version 2 encode this scope. Historical version-1 receipts never substitute for current gate results.
