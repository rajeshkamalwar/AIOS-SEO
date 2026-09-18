---
id: "GAP-DOM-HTTP"
title: "Delivery and status behavior canonical capability delivery"
status: "OPEN"
severity: "HIGH"
scope: "Full domain capability delivery, not a blocker for unrelated dependency-ready work"
owner_role: "Delivery and status behavior domain owner and independent evaluation"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md", "docs/35-QUALITY-SELF-AUDIT-GATES.md"]
implementation: ["packages/jobs/index.ts", "packages/perception/address.ts", "packages/perception/collector.ts", "packages/perception/dns.ts", "packages/perception/transport.ts", "packages/perception/url.ts", "packages/persistence/index.ts"]
tests: ["tests/collector.test.ts", "tests/http-evidence.test.ts", "tests/jobs.test.ts"]
reports: ["docs/41-NEXT-PHASE-READINESS-PLAN.md"]
closure_required: "Every applicable linked capability has its canonical evidence/sensor/skill/diagnosis/verification chain, independent release/evaluation and required real-world/production evidence; no critical/high dependency gaps."
---

# GAP-DOM-HTTP — Delivery and status behavior

Canonical responsibilities: [CAP-HTTP-01](../capabilities/CAP-HTTP-01.md), [CAP-HTTP-02](../capabilities/CAP-HTTP-02.md), [CAP-HTTP-03](../capabilities/CAP-HTTP-03.md), [CAP-HTTP-04](../capabilities/CAP-HTTP-04.md), [CAP-HTTP-05](../capabilities/CAP-HTTP-05.md).

Read [14](../../docs/14-CAPABILITY-TAXONOMY.md) and [15](../../docs/15-CAPABILITY-CONTRACT.md) for definitions. Partial prerequisites are individually traced in the capability notes; they do not close this delivery gap. Applicability comes from18, never assumed for every site.

## History

- OPEN — 2026-09-18 inventory at2b6d527: full canonical delivery/release and operational proof not established. Keep this history when child capabilities advance.
