# M3 implementation report

Date: 2026-09-17. M2 baseline: `e78d956`.
Status: **Implemented and tested in the local synthetic profile.**

M3 adds a bounded public-perception core: URL identity and action-path exclusion, public-destination DNS checks, robots parsing with longest-match Allow precedence, entity-safe sitemap parsing, deterministic bounded frontier admission, HTTP receipt validation, and a fail-closed render boundary. Fixture loading is limited to repository fixtures; no external request is made by the local profile.

The renderer returns an explicit disabled result until an isolated Linux worker and egress proxy are available. This preserves the ADR-004 boundary: browser contexts are not treated as an OS security boundary and browser rendering is never represented as search-engine indexing truth.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 153 passed; 0 failed/skipped |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Specification validator | Passed: 19 schemas, 989 references, 48 catalog records, 104 document links |

Tests cover URL credential/action rejection, identity preservation, robots precedence and sitemap declarations, XML entity rejection, off-origin exclusion, deterministic frontier uniqueness/bounds and renderer fail-closed behavior. M1/M2 persistence and governance tests remain in the same suite.

## Limits

M3 does not claim production SSRF resistance, network sandbox safety, browser isolation, live HTTP collection, durable CrawlTarget/PageSnapshot persistence, or JavaScript rendering. Those require the approved deployment profile, pinned isolated worker, egress enforcement and additional fixture-server/security tests. No business inference, strategy, model call or website-write capability is present.

M4 may add deterministic understanding contracts only after re-reading its specified Twin/graph/model/skill/evaluation documents and ADR-005. 
