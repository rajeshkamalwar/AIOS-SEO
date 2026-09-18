---
id: "GAP-DOM-JS"
title: "Rendering and modern website behavior canonical capability delivery"
status: "OPEN"
severity: "HIGH"
affected_capabilities: ["CAP-JS-01", "CAP-JS-02", "CAP-JS-03", "CAP-JS-04", "CAP-JS-05", "CAP-JS-06", "CAP-JS-07", "CAP-JS-08"]
scope: "Full domain capability delivery, not a blocker for unrelated dependency-ready work"
owner_role: "Rendering and modern website behavior domain owner and independent evaluation"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md", "docs/35-QUALITY-SELF-AUDIT-GATES.md"]
implementation: ["packages/jobs/frontier-links.ts", "packages/perception/dom.ts", "packages/perception/render-input.ts", "packages/perception/render-manifest.ts", "packages/perception/render-result.ts", "packages/persistence/migrations/010-render-records.sql", "workers/render-fixture/Dockerfile", "workers/render-fixture/worker.mjs"]
tests: ["scripts/test-render.mjs", "tests/dom.test.ts", "tests/frontier-links.test.ts", "tests/render-input.test.ts", "tests/render-manifest.test.ts", "tests/render-persistence.test.ts", "tests/render-result.test.ts"]
reports: ["docs/41-NEXT-PHASE-READINESS-PLAN.md"]
closure_required: "Every applicable linked capability has its canonical evidence/sensor/skill/diagnosis/verification chain, independent release/evaluation and required real-world/production evidence; no critical/high dependency gaps."
---

# GAP-DOM-JS — Rendering and modern website behavior

Canonical responsibilities: [CAP-JS-01](../capabilities/CAP-JS-01.md), [CAP-JS-02](../capabilities/CAP-JS-02.md), [CAP-JS-03](../capabilities/CAP-JS-03.md), [CAP-JS-04](../capabilities/CAP-JS-04.md), [CAP-JS-05](../capabilities/CAP-JS-05.md), [CAP-JS-06](../capabilities/CAP-JS-06.md), [CAP-JS-07](../capabilities/CAP-JS-07.md), [CAP-JS-08](../capabilities/CAP-JS-08.md).

Read [14](../../docs/14-CAPABILITY-TAXONOMY.md) and [15](../../docs/15-CAPABILITY-CONTRACT.md) for definitions. Partial prerequisites are individually traced in the capability notes; they do not close this delivery gap. Applicability comes from18, never assumed for every site.

## History

- OPEN — 2026-09-18 inventory at2b6d527: full canonical delivery/release and operational proof not established. Keep this history when child capabilities advance.

This is an aggregate delivery gap. `affected_capabilities` identifies the still-affected rows. A separately verified capability may leave that set with an appended evidence-backed scope update while sibling gaps remain open; do not force unrelated capabilities to complete together.
