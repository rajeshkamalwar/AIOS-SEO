---
id: "GAP-DOM-SMP"
title: "Sitemap and feed discovery canonical capability delivery"
status: "OPEN"
severity: "HIGH"
scope: "Full domain capability delivery, not a blocker for unrelated dependency-ready work"
owner_role: "Sitemap and feed discovery domain owner and independent evaluation"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md", "docs/35-QUALITY-SELF-AUDIT-GATES.md"]
implementation: ["packages/jobs/frontier-links.ts", "packages/jobs/frontier.ts", "packages/perception/sitemap.ts", "packages/persistence/migrations/013-sitemap-documents.sql"]
tests: ["tests/frontier-persistence.test.ts", "tests/sitemap-index-persistence.test.ts", "tests/sitemap.test.ts"]
reports: ["docs/41-NEXT-PHASE-READINESS-PLAN.md"]
closure_required: "Every applicable linked capability has its canonical evidence/sensor/skill/diagnosis/verification chain, independent release/evaluation and required real-world/production evidence; no critical/high dependency gaps."
---

# GAP-DOM-SMP — Sitemap and feed discovery

Canonical responsibilities: [CAP-SMP-01](../capabilities/CAP-SMP-01.md), [CAP-SMP-02](../capabilities/CAP-SMP-02.md), [CAP-SMP-03](../capabilities/CAP-SMP-03.md), [CAP-SMP-04](../capabilities/CAP-SMP-04.md).

Read [14](../../docs/14-CAPABILITY-TAXONOMY.md) and [15](../../docs/15-CAPABILITY-CONTRACT.md) for definitions. Partial prerequisites are individually traced in the capability notes; they do not close this delivery gap. Applicability comes from18, never assumed for every site.

## History

- OPEN — 2026-09-18 inventory at2b6d527: full canonical delivery/release and operational proof not established. Keep this history when child capabilities advance.
