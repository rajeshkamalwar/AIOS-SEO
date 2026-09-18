# ADR-011: Bounded discovery parsing

Status: Accepted reversible engineering default.

## Decision

Robots parsing implements RFC9309 group selection and octet matching. Unknown, truncated, malformed or unavailable policy stops new page admission. HTTP 401/403 denies; 404/410 yields no available rules. Fetching robots itself is the sole bootstrap exception. This is a deterministic policy result, not a claim about site defects.

Use pinned `sax` 1.6.1 in strict/namespace/XML-entity mode for sitemap event parsing. Its workload is bounded untrusted XML with entity decoding and structural location extraction; regular-expression extraction could turn malformed XML, extensions or sitemap-index documents into false page targets. There is no DOM, external entity retrieval or DTD support. Application checks add one recognized root, namespace and depth limits, bounded locations, explicit exclusions and index/page separation. Text sitemaps use the same URL admission. Unknown entities, DTDs and malformed structures fail closed. A maintained parser avoids writing a custom XML tokenizer; no general-purpose XML framework is introduced.

Frontier equality uses the full normalized URL. Admission remains at most 500 across repeated calls, discovered entries at most 5000, query variants at most 20 per pathname, and off-origin members remain excluded. Sitemap traversal has separate 20-document/depth-two/cycle bounds. These in-memory helpers are conformance components; durable dispatch remains a separate N1 requirement.

## Sources

- [RFC9309](https://www.rfc-editor.org/rfc/rfc9309.html)
- [Sitemap protocol](https://www.sitemaps.org/protocol.html)
- [sax parser behavior and strict entities](https://github.com/isaacs/sax-js)
- Canonical documents 30, 33, 34.
