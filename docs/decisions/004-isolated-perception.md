# ADR-004: isolated perception

Status: Accepted engineering default for local first-slice implementation.
Date: 2026-09-17.
Authority: user instruction to resolve reversible engineering decisions; no production privacy or external write grant.

## Context

Hostile HTML/JS must not reach credentials, DB, internal network or unlimited resources.

## Decision

Use bounded HTTP parsing and a separate Playwright Chromium Linux worker behind enforced public egress.

## Alternatives

Browser-only crawl wastes resources; same-process renderer or browser context alone is not a hostile-code boundary.

## Consequences

Sandbox/container/browser versions pinned and tested atM3. Production rendering disabled until isolation and egress probes pass.

Implementation acceptance: [38](../38-FIRST-SLICE-IMPLEMENTATION-PLAN.md); source rationale: [37](../37-IMPLEMENTATION-ARCHITECTURE.md).
