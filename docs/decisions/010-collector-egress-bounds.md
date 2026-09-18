# ADR-010: Conservative public collection transport

Status: Accepted reversible engineering default under the continuous implementation mandate.

## Decision

Use Node's explicit per-request HTTP/S transport with no shared agent, validated pinned DNS addresses, unchanged Host/SNI and normal TLS verification. Resolve A/AAAA and CNAME chains with a three-second cancellable resolver deadline, eight alias edges and at most 64 answers. Reject a mixed answer set if any address is ineligible. URL admission runs before DNS and on each redirect; initial implementation permits only same-origin redirects. A same-host HTTP-to-HTTPS extension remains disabled until the dispatcher records its origin authorization.

Use the built-in IP parser and subnet matcher. IPv4 special-use allocations are denied conservatively, including globally reachable exceptions within special blocks. IPv6 is restricted to ordinary 2000::/3 unicast outside special-use ranges. Mapped, translated and tunneling allocations are denied. This may exclude legitimate special-purpose hosts; it never establishes independent firewall enforcement.

Bound both transferred compressed bytes and decoded bytes by the response cap, rejecting unknown encodings. Exactly-cap responses succeed; overflow returns a bounded prefix with `truncated=true` and closes transport. Redirect and unsupported-MIME bodies are not drained. Absolute request, connection and header deadlines are separate from idle timeouts; response headers are capped at 32KiB. Retained headers use an allowlist excluding cookies/authentication and arbitrary server fields. GET only, no cookies, no ambient proxy agents.

## Scope and evidence

These are library controls tested with local hostile fixture servers. Runtime customer collection stays gated by N0 and independent controlled egress. Robots admission, durable per-hop reservations, run budgets, retries/fairness and authoritative receipt persistence are dispatcher responsibilities still required for N1. Test transport injection is trusted test wiring, never request-controlled input. No external URL was fetched by the test suite.

## Sources

- [IANA IPv4 special-purpose registry](https://www.iana.org/assignments/iana-ipv4-special-registry/)
- [IANA IPv6 special-purpose registry](https://www.iana.org/assignments/iana-ipv6-special-registry/)
- [Node HTTP request and timeout semantics](https://nodejs.org/docs/latest-v24.x/api/http.html)
- Canonical documents 30, 33, 34 and ADR-004.

Registry policy is a reviewable source snapshot, not a claim that network assignments never change. Review the CIDRs when refreshing runtime/security dependencies.
