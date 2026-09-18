# M4 implementation report

Date: 2026-09-17. M3 baseline: `136b86b`.
Status: **Implemented and tested in the local synthetic profile.**

M4 adds deterministic, evidence-first understanding primitives: literal page claims with explicit observed basis and locators, a provider-neutral gateway that fails closed when external model policy is disabled, bounded schema-validated graph projection with real endpoint checks, and deterministic opportunity ordering/deduplication capped at three. No model output is treated as accepted provenance and no action authority is exposed.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 157 passed; 0 failed/skipped |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Specification validator | Passed: 19 schemas, 989 references, 48 catalog records, 104 document links |
| `npm audit --omit=dev` | 0 vulnerabilities reported |

Tests cover literal-only extraction, unknown field preservation, model-provider fail-closed behavior, graph endpoint/provenance schema validation, graph bounds and deterministic opportunity selection.

## Limits

M4 does not activate a model provider, create a Digital Business Twin database revision, publish a production graph projection, or claim model quality. External model calls remain blocked by the local profile and require approved provider policy plus frozen evaluation evidence. No website mutation, private connector, ranking metric or causal outcome is introduced.
