# ADR-003: runtime and contracts

Status: Accepted engineering default for local first-slice implementation.
Date: 2026-09-17.
Authority: user instruction to resolve reversible engineering decisions; no production privacy or external write grant.

## Context

I/O-bound collectors and browser adapters benefit from one typed runtime and shared client contracts.

## Decision

Use strict TypeScript, Node24, npm workspaces, pg and Fastify5 with Ajv2020 schemas.

## Alternatives

Python remains possible for future statistics; two core languages add contract drift. ORM abstractions obscure compound constraints. Default coercive validation changes user data.

## Consequences

Lock exact packages at implementation, disable coercion/default insertion/removal, validate semantics after shape. Independent Python schema checks provide cross-validator coverage.

Implementation acceptance: [38](../38-FIRST-SLICE-IMPLEMENTATION-PLAN.md); source rationale: [37](../37-IMPLEMENTATION-ARCHITECTURE.md).
