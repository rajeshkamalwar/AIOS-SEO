# ADR-002: durable sql work

Status: Accepted engineering default for local first-slice implementation.
Date: 2026-09-17.
Authority: user instruction to resolve reversible engineering decisions; no production privacy or external write grant.

## Context

Twenty-minute read-only runs, ten concurrent runs, modest fan-out and domain-local atomicity.

## Decision

Use PostgreSQL jobs, transactional outbox/inbox, SKIP LOCKED leases and fencing.

## Alternatives

Temporal is useful for later human waits/multi-day actions but adds service/versioning operations now. Kafka solves a streaming workload not yet present. In-memory timers lose continuity.

## Consequences

Application owns explicit transition/retry tests and poison handling. External reads may repeat; domain acceptance deduplicates.

Implementation acceptance: [38](../38-FIRST-SLICE-IMPLEMENTATION-PLAN.md); source rationale: [37](../37-IMPLEMENTATION-ARCHITECTURE.md).
