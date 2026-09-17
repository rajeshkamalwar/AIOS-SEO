# 33 — Event Job Contract

Status: machine envelopes in [event.schema.json](../spec/event.schema.json) and [job.schema.json](../spec/job.schema.json); SQL durable queue chosen in ADR-002.

The fifteen event variants specify exact payloads. Producer is authenticated service/version, not arbitrary caller text. occurred_at is source activity time; recorded_at/knowledge_seq come from26 acceptance. Event ID is UUID, aggregate_version monotonic per aggregate, correlation_id identifies run, causation_id identifies prior event or null for an initial command. No raw HTML, secrets or model text on the bus.

## Atomicity and replay

Commit domain change plus event/outbox in one transaction. Outbox dispatcher retries delivery at least once; consumer inserts inbox(tenant,consumer,event_id) in the same transaction as local state/job creation. Duplicate delivery returns prior result. Idempotency key reuse with different canonical input hash returns conflict. Crawl admission keys are unique per tenant; job key includes tenant, run, kind, input revision and policy version. Per-attempt observation dedupe is separate from intentional new collection.

Out-of-order aggregate versions trigger authoritative resync; never assume global event order. Unknown schema versions dead-letter without coercion. Projection replay reads retained accepted records into a new version, validates watermark/counts, then atomically switches publication pointer. It cannot create crawl jobs, model calls, approvals, notifications or re-run remote tools. Recovery of unfinished jobs is a distinct mode.

## Job transitions and fencing

queued/retry_wait→leased only when available_at≤now<deadline, run active, budget/grants current and attempts<3. Claim with FOR UPDATE SKIP LOCKED, increment attempt, random lease_token, lease_until=now+30s; persist attempt start. Heartbeat every10s renews only matching live token. Network/model work never holds database transaction open.

leased→completed requires live token, validated result and atomic domain/outbox commit. leased→retry_wait clears lease and records retryable error; delay full jitter in [0,min(30,2^attempt)] seconds, provider Retry-After may lengthen it. Permission/schema/policy/revocation failures→failed without retry. Expired lease→retry_wait or dead_letter at attempt3; a late old worker cannot commit. Failed state denotes terminal classified failure; dead_letter denotes exhausted recovery or unprocessable message. Cancellation clears leases, fences acceptance and retains collected artifacts; no claim of reversing a request.

One network attempt per fetch job attempt, including separately charged redirect hops; no inner three-retry loop. Model attempts independently capped at2, even if job recovery offers3. Crash after remote read may cause another read, but original attempt ID cannot create duplicate observations. Unknown model bill retains worst-case reservation. All terminal state transitions clear lease fields. Job deadline may not exceed run deadline; attempt3 cannot requeue.

Budget reservations use atomic compare-and-increment of used+reserved against run/tenant caps. Final receipts settle reservations once. Cancellation/restart does not reset used budget. Tenant deletion epoch is checked at claim and commit; stale workers cannot resurrect data.

## Admission and health

Development load target100 tenants/200 sites; max1 active run/site,2/tenant,10 globally. Round-robin eligible tenants by last dispatch;2 per-origin requests and1s spacing apply across all their workers. Separate HTTP/render/model lanes, global render concurrency2. Persist scheduling turns so restart does not starve small tenants. API returns429 with retry guidance when tenant admission queue reaches10; global queued runs≤200.

Outbox polling1s, batch50; alarm when oldest pending>60s or poison message exists. Deadline sweep every10s; daily missed-event reconciliation. Database unavailability halts acceptance/dispatch; never pretend an in-memory fallback is durable. Job progress persisted at each stage; twenty-minute run expiry yields partial/failed according to available evidence, not synthetic published success.
