# ADR-005: replaceable reasoning

Status: Accepted engineering default for local first-slice implementation.
Date: 2026-09-17.
Authority: user instruction to resolve reversible engineering decisions; no production privacy or external write grant.

## Context

Business inference is uncertain; routing must honor quality, privacy and budgets independently of vendor.

## Decision

Use an internal task-based model gateway with immutable evidence inputs and independently validated outputs.

## Alternatives

One vendor agent framework as domain architecture couples authority/memory to a provider. LLM parsing of URLs or policy is unnecessary uncertainty.

## Consequences

Adapters must pass frozen quality/privacy tests. Fallback abstains unless approved equivalent; no model gets tool authority.

Implementation acceptance: [38](../38-FIRST-SLICE-IMPLEMENTATION-PLAN.md); source rationale: [37](../37-IMPLEMENTATION-ARCHITECTURE.md).
