---
id: "GAP-DOM-ROB"
title: "Crawl and indexing directives canonical capability delivery"
status: "OPEN"
severity: "HIGH"
affected_capabilities: ["CAP-ROB-01", "CAP-ROB-02", "CAP-ROB-03", "CAP-ROB-04", "CAP-ROB-05"]
scope: "Full domain capability delivery, not a blocker for unrelated dependency-ready work"
owner_role: "Crawl and indexing directives domain owner and independent evaluation"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md", "docs/35-QUALITY-SELF-AUDIT-GATES.md"]
implementation: ["packages/jobs/frontier-context.ts", "packages/perception/collector.ts", "packages/perception/dom-isolated.ts", "packages/perception/dom.ts", "packages/perception/robots-admission.ts", "packages/perception/robots.ts", "packages/persistence/index.ts"]
tests: ["tests/collector.test.ts", "tests/dom-isolated.test.ts", "tests/dom.test.ts", "tests/frontier-persistence.test.ts", "tests/http-evidence.test.ts", "tests/jobs.test.ts", "tests/robots.test.ts"]
reports: ["docs/41-NEXT-PHASE-READINESS-PLAN.md"]
closure_required: "Every applicable linked capability has its canonical evidence/sensor/skill/diagnosis/verification chain, independent release/evaluation and required real-world/production evidence; no critical/high dependency gaps."
---

# GAP-DOM-ROB — Crawl and indexing directives

Canonical responsibilities: [CAP-ROB-01](../capabilities/CAP-ROB-01.md), [CAP-ROB-02](../capabilities/CAP-ROB-02.md), [CAP-ROB-03](../capabilities/CAP-ROB-03.md), [CAP-ROB-04](../capabilities/CAP-ROB-04.md), [CAP-ROB-05](../capabilities/CAP-ROB-05.md).

Read [14](../../docs/14-CAPABILITY-TAXONOMY.md) and [15](../../docs/15-CAPABILITY-CONTRACT.md) for definitions. Partial prerequisites are individually traced in the capability notes; they do not close this delivery gap. Applicability comes from18, never assumed for every site.

## History

- OPEN — 2026-09-18 inventory at2b6d527: full canonical delivery/release and operational proof not established. Keep this history when child capabilities advance.

This is an aggregate delivery gap. `affected_capabilities` identifies the still-affected rows. A separately verified capability may leave that set with an appended evidence-backed scope update while sibling gaps remain open; do not force unrelated capabilities to complete together.
