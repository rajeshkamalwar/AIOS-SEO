# N1 implementation report

## Scope

Added the first controlled HTTP collection path. Each request resolves all addresses, rejects private or reserved destinations, pins the selected address at connection time, bounds redirects and response bytes, sends GET only, preserves response headers/body provenance for supported document MIME types, and suppresses unsupported bodies.

The transport is injectable for deterministic fixture tests; production callers use the pinned Node HTTP/S transport. Redirects must remain on the same origin and are revalidated on every hop.

## Evidence

- Public-address resolution and pinning are covered by `tests/collector.test.ts`.
- Private destination answers fail before transport dispatch.
- The existing URL, robots, sitemap, frontier and IPv6 egress tests remain green.

## Remaining N1 work

Durable CrawlTarget/PageSnapshot persistence, robots-first orchestration, retry/fairness accounting, an isolated nonroot browser worker, and adversarial live fixture-server/network tests remain before N1 exit. No inference or website-write behavior was added.
