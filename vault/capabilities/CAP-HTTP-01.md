---
id: "CAP-HTTP-01"
title: "Status and availability"
domain: "HTTP"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "partial_behavior"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md"]
implementation: ["packages/perception/collector.ts", "packages/perception/transport.ts", "packages/perception/dns.ts", "packages/perception/address.ts", "packages/persistence/index.ts", "packages/jobs/index.ts"]
tests: ["tests/collector.test.ts", "tests/http-evidence.test.ts", "tests/jobs.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md"]
gaps: ["GAP-DOM-HTTP", "GAP-004", "GAP-007"]
scope: "Safe bounded low-level HTTP transport and exact synthetic/loopback status-body-receipt persistence and snapshot projection."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-HTTP-01 — Status and availability

Canonical responsibility: [CAP-HTTP-01](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `partial_behavior` / `TESTED`.

Safe bounded low-level HTTP transport and exact synthetic/loopback status-body-receipt persistence and snapshot projection.

Implementation: [collector.ts](../../packages/perception/collector.ts), [transport.ts](../../packages/perception/transport.ts), [dns.ts](../../packages/perception/dns.ts), [address.ts](../../packages/perception/address.ts), [index.ts](../../packages/persistence/index.ts), [index.ts](../../packages/jobs/index.ts)

Tests: [collector.test.ts](../../tests/collector.test.ts), [http-evidence.test.ts](../../tests/http-evidence.test.ts), [jobs.test.ts](../../tests/jobs.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No authorized production public observation runner or repeated contextual availability diagnosis; network helper existence is not activation.

Open gaps: [GAP-DOM-HTTP](../gaps/GAP-DOM-HTTP.md), [GAP-004](../gaps/GAP-004.md), [GAP-007](../gaps/GAP-007.md).

## Stage evidence

| Stage | Current evidence disposition |
| --- | --- |
| DEFINED | Canonical row and inherited contract linked above |
| IMPLEMENTED | Full canonical scope not established; partial code listed separately |
| TESTED | Full capability acceptance not established; fixture prerequisites are scope-limited |
| REAL_WORLD_VERIFIED | No authorized retained capability-level verification found |
| PRODUCTION_PROVEN | No production observation window/denominator and operations proof found |

## History

- 2026-09-18 baseline2b6d527: conservative inventory import; no maturity promotion from test counts or draft manifests.
