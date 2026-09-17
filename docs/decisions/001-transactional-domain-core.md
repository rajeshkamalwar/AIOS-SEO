# ADR-001: transactional domain core

Status: Accepted engineering default for local first-slice implementation.
Date: 2026-09-17.
Authority: user instruction to resolve reversible engineering decisions; no production privacy or external write grant.

## Context

Evidence, revisions and outbox must commit together; radius-two graph fits relational assertions.

## Decision

Use PostgreSQL17 with typed SQL/pg and tenant composite constraints, forced RLS and tenant knowledge clock.

## Alternatives

SQLite lacks the required production role/RLS boundary; document-only storage complicates cross-record integrity; graph store duplicates truth.

## Consequences

Clock serializes short tenant acceptance transactions; benchmark before scaling. No network under locks.

Implementation acceptance: [38](../38-FIRST-SLICE-IMPLEMENTATION-PLAN.md); source rationale: [37](../37-IMPLEMENTATION-ARCHITECTURE.md).
