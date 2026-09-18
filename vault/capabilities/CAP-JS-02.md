---
id: "CAP-JS-02"
title: "Raw/rendered parity"
domain: "JS"
maturity: "DEFINED"
local_maturity: "TESTED"
local_scope_kind: "foundation_only"
completion: "INCOMPLETE"
canonical_release: "unreleased"
specs: ["docs/14-CAPABILITY-TAXONOMY.md", "docs/15-CAPABILITY-CONTRACT.md", "docs/18-BUSINESS-ARCHETYPE-MATRIX.md", "spec/examples/skill-render-parity.json"]
implementation: ["workers/render-fixture/worker.mjs", "workers/render-fixture/Dockerfile", "packages/perception/render-input.ts", "packages/perception/render-result.ts", "packages/perception/render-manifest.ts", "packages/persistence/migrations/010-render-records.sql", "packages/perception/dom.ts"]
tests: ["scripts/test-render.mjs", "tests/render-input.test.ts", "tests/render-result.test.ts", "tests/render-manifest.test.ts", "tests/render-persistence.test.ts", "tests/dom.test.ts"]
reports: ["docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md", "docs/41-NEXT-PHASE-READINESS-PLAN.md", "docs/reports/N1-IMPLEMENTATION.md"]
gaps: ["GAP-DOM-JS", "GAP-008", "GAP-009"]
scope: "Real isolated offline synthetic Chromium 0/2/5-second DOM sampling, measured timing/pending counts, raw-input hash binding, pure receipt/manifests and storage schema."
baseline: "2b6d527"
required_stages: "Canonical15/18/28/35 applicable evidence, implementation, independent test/release, real-world and production proof; applicability and stage evidence must be explicitly reviewed before COMPLETE."
---

# CAP-JS-02 — Raw/rendered parity

Canonical responsibility: [CAP-JS-02](../../docs/14-CAPABILITY-TAXONOMY.md) (exact row ID); inherited [contract](../../docs/15-CAPABILITY-CONTRACT.md) and [archetype applicability](../../docs/18-BUSINESS-ARCHETYPE-MATRIX.md). Definition is deliberately not copied.

Full capability maturity: **DEFINED**, completion: **INCOMPLETE**. Local evidence scope: `foundation_only` / `TESTED`.

Real isolated offline synthetic Chromium 0/2/5-second DOM sampling, measured timing/pending counts, raw-input hash binding, pure receipt/manifests and storage schema.

Implementation: [worker.mjs](../../workers/render-fixture/worker.mjs), [Dockerfile](../../workers/render-fixture/Dockerfile), [render-input.ts](../../packages/perception/render-input.ts), [render-result.ts](../../packages/perception/render-result.ts), [render-manifest.ts](../../packages/perception/render-manifest.ts), [010-render-records.sql](../../packages/persistence/migrations/010-render-records.sql), [dom.ts](../../packages/perception/dom.ts)

Tests: [test-render.mjs](../../scripts/test-render.mjs), [render-input.test.ts](../../tests/render-input.test.ts), [render-result.test.ts](../../tests/render-result.test.ts), [render-manifest.test.ts](../../tests/render-manifest.test.ts), [render-persistence.test.ts](../../tests/render-persistence.test.ts), [dom.test.ts](../../tests/dom.test.ts)

Evidence/reports: [40-POST-M5-INTEGRATION-REALITY-REVIEW.md](../../docs/40-POST-M5-INTEGRATION-REALITY-REVIEW.md), [41-NEXT-PHASE-READINESS-PLAN.md](../../docs/41-NEXT-PHASE-READINESS-PLAN.md), [N1-IMPLEMENTATION.md](../../docs/reports/N1-IMPLEMENTATION.md)

Remaining: No governed persisted rendered-result acceptance, matched raw/render parity evaluator, hydration defect diagnosis or repeated dynamic-metadata assessment. Storage tests are owner-seeded, not accepted renderer output.

Open gaps: [GAP-DOM-JS](../gaps/GAP-DOM-JS.md), [GAP-008](../gaps/GAP-008.md), [GAP-009](../gaps/GAP-009.md).

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
