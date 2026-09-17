# ADR-006: data and activation

Status: Accepted engineering default for local first-slice implementation.
Date: 2026-09-17.
Authority: user instruction to resolve reversible engineering decisions; no production privacy or external write grant.

## Context

Implementation needs real persistence without silently choosing customer data rights or residency.

## Decision

Use a local synthetic profile plus explicit approved real-deployment policy; private blob interface and restricted lifecycle.

## Alternatives

Permissive default cloud/provider policy invents consent. Blocking all implementation on vendor selection prevents harmless fixture work.

## Consequences

Local mode disables live collection/model calls. Real region/retention/provider/support commitments require deployment approval; deletion ledger survives restore.

Implementation acceptance: [38](../38-FIRST-SLICE-IMPLEMENTATION-PLAN.md); source rationale: [37](../37-IMPLEMENTATION-ARCHITECTURE.md).
