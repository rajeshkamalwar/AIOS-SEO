---
id: "GAP-DOM-POL"
title: "Search policy and security integrity canonical capability delivery"
status: "OPEN"
severity: "HIGH"
affected_capabilities: ["CAP-POL-01", "CAP-POL-02", "CAP-POL-03", "CAP-POL-04", "CAP-POL-05"]
scope: "Full domain capability delivery, not a blocker for unrelated dependency-ready work"
owner_role: "Search policy and security integrity domain owner and independent evaluation"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md", "docs/35-QUALITY-SELF-AUDIT-GATES.md"]
implementation: ["packages/jobs/index.ts", "packages/persistence/transaction.ts", "packages/policy/input-eligibility.ts", "packages/runtime/index.ts", "packages/skills/index.ts", "spec/quality-gates.json", "spec/sources/manifest.json"]
tests: ["tests/contracts.test.ts", "tests/foundation.test.ts", "tests/input-eligibility.test.ts", "tests/jobs.test.ts", "tests/runtime.test.ts"]
reports: ["docs/41-NEXT-PHASE-READINESS-PLAN.md"]
closure_required: "Every applicable linked capability has its canonical evidence/sensor/skill/diagnosis/verification chain, independent release/evaluation and required real-world/production evidence; no critical/high dependency gaps."
---

# GAP-DOM-POL — Search policy and security integrity

Canonical responsibilities: [CAP-POL-01](../capabilities/CAP-POL-01.md), [CAP-POL-02](../capabilities/CAP-POL-02.md), [CAP-POL-03](../capabilities/CAP-POL-03.md), [CAP-POL-04](../capabilities/CAP-POL-04.md), [CAP-POL-05](../capabilities/CAP-POL-05.md).

Read [14](../../docs/14-CAPABILITY-TAXONOMY.md) and [15](../../docs/15-CAPABILITY-CONTRACT.md) for definitions. Partial prerequisites are individually traced in the capability notes; they do not close this delivery gap. Applicability comes from18, never assumed for every site.

## History

- OPEN — 2026-09-18 inventory at2b6d527: full canonical delivery/release and operational proof not established. Keep this history when child capabilities advance.

This is an aggregate delivery gap. `affected_capabilities` identifies the still-affected rows. A separately verified capability may leave that set with an appended evidence-backed scope update while sibling gaps remain open; do not force unrelated capabilities to complete together.
