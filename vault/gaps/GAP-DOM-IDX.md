---
id: "GAP-DOM-IDX"
title: "Indexability and index coverage canonical capability delivery"
status: "OPEN"
severity: "HIGH"
affected_capabilities: ["CAP-IDX-01", "CAP-IDX-02", "CAP-IDX-03", "CAP-IDX-04", "CAP-IDX-05"]
scope: "Full domain capability delivery, not a blocker for unrelated dependency-ready work"
owner_role: "Indexability and index coverage domain owner and independent evaluation"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md", "docs/35-QUALITY-SELF-AUDIT-GATES.md"]
implementation: ["packages/perception/collector.ts", "packages/perception/dom.ts", "packages/perception/robots.ts"]
tests: ["tests/collector.test.ts", "tests/dom.test.ts", "tests/robots.test.ts"]
reports: ["docs/41-NEXT-PHASE-READINESS-PLAN.md"]
closure_required: "Every applicable linked capability has its canonical evidence/sensor/skill/diagnosis/verification chain, independent release/evaluation and required real-world/production evidence; no critical/high dependency gaps."
---

# GAP-DOM-IDX — Indexability and index coverage

Canonical responsibilities: [CAP-IDX-01](../capabilities/CAP-IDX-01.md), [CAP-IDX-02](../capabilities/CAP-IDX-02.md), [CAP-IDX-03](../capabilities/CAP-IDX-03.md), [CAP-IDX-04](../capabilities/CAP-IDX-04.md), [CAP-IDX-05](../capabilities/CAP-IDX-05.md).

Read [14](../../docs/14-CAPABILITY-TAXONOMY.md) and [15](../../docs/15-CAPABILITY-CONTRACT.md) for definitions. Partial prerequisites are individually traced in the capability notes; they do not close this delivery gap. Applicability comes from18, never assumed for every site.

## History

- OPEN — 2026-09-18 inventory at2b6d527: full canonical delivery/release and operational proof not established. Keep this history when child capabilities advance.

This is an aggregate delivery gap. `affected_capabilities` identifies the still-affected rows. A separately verified capability may leave that set with an appended evidence-backed scope update while sibling gaps remain open; do not force unrelated capabilities to complete together.
