# 10 — Event and Temporal Model

Status: proposed contract. The Brain's continuity comes from durable state and history, not a permanently open model session.

## 1. Time semantics

| Field | Meaning |
| --- | --- |
| `observed_at` / `occurred_at` | When the source was observed or event happened; retain source clock uncertainty |
| `source_window_start/end` | Period covered by a metric, distinct from collection time |
| `valid_from/to` | When a claim applies in the modeled world; unknown bounds remain unknown |
| `recorded_at` | When AIOS accepted this revision |
| `superseded_at` | When the recorded belief was replaced in system knowledge |
| `evaluated_at` | When an evaluation was computed |
| `fresh_until` | Policy-derived usability deadline, not proof of truth |

Use UTC instants for system events and half-open internal intervals. Preserve source timezone, granularity and original inclusive/exclusive date semantics for conversion. A source date is not an arbitrary UTC midnight.

Bitemporal queries support both “what do we now believe about last month?” and “what did we believe when this decision was made?” A late observation backfills valid time but never its recorded time. Corrections append a revision and explicit supersession; they do not erase what a prior decision knew.

Example: an observation for day D arrives on D+3 and is corrected on D+5. A decision at D+4 references the first revision. Current reporting may use the correction; the historical decision manifest must not.

## 2. Commands and events

A command requests authorized work; an event records an accepted fact about system activity. A webhook is untrusted input until verified, deduplicated and normalized. A domain event such as `ObservationAccepted` means ingestion succeeded, not that every derived claim is true.

Required envelope:

| Field | Purpose |
| --- | --- |
| `event_id, event_type, schema_version` | Stable identity and explicit compatibility |
| `tenant_id, scope_id` | Isolation and domain routing; global events use a separate trusted channel |
| `aggregate_type, aggregate_id, aggregate_version` | Per-aggregate ordering and optimistic concurrency |
| `occurred_at, recorded_at` | Temporal interpretation |
| `correlation_id, causation_id` | Cycle/workflow linkage and causal ancestry |
| `actor_ref, producer_version` | Authenticated source identity |
| `payload, evidence_refs` | Small validated facts and artifact references |
| `deduplication_key, source_revision` | Provider-aware duplicate/revision handling |
| `trace_id, classification` | Operations and data handling |

Do not place credentials, raw HTML or full prompt transcripts on the event bus. Typed internal payloads and versioned schemas are required.

Representative events: `ObservationAccepted`, `SourceCoverageChanged`, `BeliefRevised`, `TwinRevisionAccepted`, `OpportunityAssessed`, `StrategyRevisionAccepted`, `ProposalFrozen`, `PolicyDecisionRecorded`, `ApprovalGranted`, `ApprovalRevoked`, `DeploymentOutcomeUnknown`, `DeploymentConfirmed`, `VerificationFailed`, `EvaluationPublished`, `LearningPromoted`, `SkillRevoked`, `AutonomySuspended`.

## 3. Delivery, transactions and replay

Use transactional domain updates plus an outbox. The same transaction commits the state transition and event; a dispatcher delivers at least once. Consumers persist an inbox/deduplication record with their local state update. Poison messages are quarantined with bounded retries and operator visibility.

Guarantee ordering only where required, typically an aggregate or site strategy. There is no global event ordering guarantee. Reject stale expected versions; buffer or resynchronize missing versions. Deduplication includes provider revision where corrections represent new information.

An outbox does not give exactly-once external side effects. Tool idempotency, conditional writes and reconciliation provide those safeguards (11). Durable workflow state is not the canonical business ledger.

Replay reconstructs projections from retained domain history and snapshots. Replay mode must never invoke website writes, send client notifications, or recreate approvals. Projection rebuilds use a versioned destination, verify counts/checksums and watermark, then switch readers. Workflow recovery resumes governed work and is a different operation from projection replay.

Schema changes are additive where possible; readers handle explicitly supported versions. Incompatible changes use a new version and tested migration/upcaster. Preserve original events; do not reinterpret old approval payloads under new semantics.

## 4. Core loop as durable work

A `BrainCycle` starts from a source change, schedule, user request or risk signal. It captures input watermark, scoped strategy/Twin versions and budget. It persists these stages:

Understand → Observe → Diagnose → Prioritize → Strategize → Act → Verify → Measure → Learn → Repeat.

The loop is logical, not one long transaction. It may stop at “insufficient evidence,” wait for consent, delegate observations, or schedule delayed measurement. “Act” can mean a governed read/investigation; a website mutation requires its own authority.

Coalesce redundant site triggers into a dirty watermark. If new observations arrive during reasoning, finish only decisions whose preconditions remain valid; schedule a follow-up for the newer watermark. Use a per-scope coordination lease with fencing token and revision checks; an expired worker cannot commit a stale strategy or dispatch a write.

Work admission applies tenant/site/provider budgets, priority, maximum fan-out and deadlines. Urgent protection checks have a reserved lane; fairness prevents one tenant monopolizing crawling or rendering. Budget exhaustion yields an explicit deferred state and next retry condition.

## 5. Separate state machines

| Aggregate | Main progression | Exceptional states |
| --- | --- | --- |
| WorkItem | queued → running → waiting → running → completed | retry_scheduled, failed, cancelled, dead_letter |
| Proposal | draft → assessed → previewed → frozen | rejected, expired, superseded |
| Authorization | pending → granted | denied, revoked, expired, consumed |
| Deployment | prepared → executing → applied | precondition_failed, outcome_unknown, partial, failed |
| Verification | pending → running → passed | failed, inconclusive |
| Compensation | requested → authorized → executing → verified | blocked_conflict, outcome_unknown, failed |
| Experiment | designed → frozen → exposed → observing → evaluating → concluded | paused, invalid, aborted |
| Learning | candidate → reviewed → promoted | rejected, superseded, revoked |

An applied deployment cannot be relabeled “not applied” after compensation; record both events. A technical verification failure does not erase successful application. An approved proposal is not automatically deployed. Guards and transition ownership must be specified in implementation schemas before writing these workflows.

## 6. Failure and race handling

| Scenario | Required response |
| --- | --- |
| Worker crashes before domain commit | No committed effect; retry with expected version |
| Dispatcher crashes after delivery | Consumer deduplication absorbs duplicate event |
| Remote write succeeds, receipt is lost | Mark outcome unknown; inspect remote resource/version before retry |
| Human edits target after approval | Precondition mismatch; regenerate preview and authority |
| Policy/skill revoked while queued | Execution-time gate denies; invalidate dependent work |
| Approval revoked during remote call | Stop new dispatch; reconcile in-flight outcome and assess compensation |
| Crawl partially completes | Persist coverage; never infer removal from an unvisited page |
| Late/revised metric changes evaluation | New evaluation revision; preserve original result and learning lineage |
| Connector revoked | Pause affected jobs, distinguish missing access from zero data |
| Restore from backup | Apply deletion ledger, reconcile external effects, resume writes only after authority checks |

Retries use classified errors, exponential backoff with jitter, provider guidance, deadlines and a maximum attempt budget. Validation and permission failures are not transient errors. Cancellation is cooperative; it does not guarantee an in-flight network operation was cancelled.

## 7. Retention and operational recovery

Snapshot aggregate state and preserve decision manifests sufficient for the chosen audit period. Retention policies must cover event payloads, artifacts, indexes, workflow history and backups. “Append-only” does not mean personal data can never be deleted: keep sensitive content behind deletable references and retain only permitted minimal audit metadata.

Define RPO/RTO and outage SLOs before production in 13. Restore drills must test the combination of database state, evidence objects, keys, workflow history and external deployment receipts. Monitor outbox lag, event age, missed schedules, dead letters, stale projections, lease conflicts and unreconciled writes.
