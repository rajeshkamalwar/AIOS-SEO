# ADR-008: local governed work authority and recovery

Status: Accepted reversible engineering default under the owner's continuation instruction.
Date: 2026-09-17.

M2 uses distinct non-owner database service roles for scheduling, independent evaluation and operator commands. A customer/agent runtime cannot write release approvals, evaluator receipts or recovery receipts. These internal adapters are not public authentication endpoints. They retain tenant RLS; global registry and scheduling metadata contain no page content. The database service credentials and operator signing keys are trusted control-plane capabilities, never delivered to model/crawl workers.

The local registry verifies Ed25519 approval signatures over canonical manifest/evaluation digests, distinct author/reviewer identities, exact scope and expiry. Local fixture keys authorize only synthetic execution; they cannot activate external collection or model calls. Registry eligibility is journaled by increasing generation; immutable bytes are never replaced. Dependency freshness/revocation is checked transitively at admission, dispatch and acceptance under shared registry locks. Operator changes take the corresponding exclusive lock.

Budget counters use integer units and atomic run/tenant reservations. Tenant limits are explicit operator configuration, with no unbounded default. Unsettled reservations survive crashes and cancellation; an unknown bill retains its maximum. A duplicate receipt cannot settle twice. Deadlines and lease expiry use database time; leases are 30 seconds, renewal is due every 10 seconds, and a stale token never renews or commits.

The synthetic deletion ledger is independently retained in a private append-only directory outside database backup/restore. A durable tombstone is written before database suspension. Dispatch and acceptance check it even if an old database snapshot is restored. This implements a stop fence, not a claim of complete deletion: active-store erasure receipts and production backup reconciliation remain separate lifecycle work.

Audit receipts use ADR-007 and a persisted, frozen dependency snapshot. Evaluator and operator roles cannot be impersonated by selecting an actor string in a request. A new passing independent receipt and an operator command are both required for recovery; old receipts remain immutable. Recovery never resets budgets, unrevokes releases, overrides deletion, or reuses lost lease tokens. Rejected output history stays rejected; replacement work gets new identities.

M2 installs deterministic audit operations only. The registry can store draft SEO manifests without granting execution to unknown handlers. Later milestones install their own typed handlers and tests. No website mutation tool is introduced.
