---
id: "GAP-DOM-CRW"
title: "Crawl discovery and resource allocation canonical capability delivery"
status: "OPEN"
severity: "HIGH"
affected_capabilities: ["CAP-CRW-01", "CAP-CRW-02", "CAP-CRW-03", "CAP-CRW-04", "CAP-CRW-05", "CAP-CRW-06"]
scope: "Full domain capability delivery, not a blocker for unrelated dependency-ready work"
owner_role: "Crawl discovery and resource allocation domain owner and independent evaluation"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md", "docs/35-QUALITY-SELF-AUDIT-GATES.md"]
implementation: ["packages/api/index.ts", "packages/jobs/frontier-context.ts", "packages/jobs/frontier-links.ts", "packages/jobs/frontier.ts", "packages/jobs/index.ts", "packages/perception/index.ts", "packages/perception/robots-admission.ts", "packages/perception/url.ts", "packages/persistence/index.ts"]
tests: ["tests/api.test.ts", "tests/frontier-links.test.ts", "tests/frontier-persistence.test.ts", "tests/jobs.test.ts", "tests/perception.test.ts", "tests/site-scope.test.ts", "tests/sitemap-index-persistence.test.ts"]
reports: ["docs/41-NEXT-PHASE-READINESS-PLAN.md"]
closure_required: "Every applicable linked capability has its canonical evidence/sensor/skill/diagnosis/verification chain, independent release/evaluation and required real-world/production evidence; no critical/high dependency gaps."
---

# GAP-DOM-CRW — Crawl discovery and resource allocation

Canonical responsibilities: [CAP-CRW-01](../capabilities/CAP-CRW-01.md), [CAP-CRW-02](../capabilities/CAP-CRW-02.md), [CAP-CRW-03](../capabilities/CAP-CRW-03.md), [CAP-CRW-04](../capabilities/CAP-CRW-04.md), [CAP-CRW-05](../capabilities/CAP-CRW-05.md), [CAP-CRW-06](../capabilities/CAP-CRW-06.md).

Read [14](../../docs/14-CAPABILITY-TAXONOMY.md) and [15](../../docs/15-CAPABILITY-CONTRACT.md) for definitions. Partial prerequisites are individually traced in the capability notes; they do not close this delivery gap. Applicability comes from18, never assumed for every site.

## History

- OPEN — 2026-09-18 inventory at2b6d527: full canonical delivery/release and operational proof not established. Keep this history when child capabilities advance.

This is an aggregate delivery gap. `affected_capabilities` identifies the still-affected rows. A separately verified capability may leave that set with an appended evidence-backed scope update while sibling gaps remain open; do not force unrelated capabilities to complete together.
