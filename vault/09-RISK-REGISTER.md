# Risk register

This indexes risk and its persistent gap, not a new policy engine. Original R01–R17 remain in [07](../docs/07-ARCHITECTURE-READINESS-REVIEW.md); accepted design dispositions are in [24](../docs/24-DECISION-REGISTER.md). Their linked gap histories preserve design resolution without inventing production closure.

| Risk / scope | Persistent tracking | Current control and remaining evidence |
| --- | --- | --- |
| Customer privacy, residency, retention and data use | [GAP-001](gaps/GAP-001.md), [GAP-R16](gaps/GAP-R16.md) | Local synthetic profile blocks live customer activation; owner-approved profile and operational evidence absent |
| Tenant identity, sessions, support and storage isolation | [GAP-002](gaps/GAP-002.md), [GAP-003](gaps/GAP-003.md) | Real local RLS/role/artifact tests; deployed identity/storage/recovery remain unproved |
| SSRF, DNS/redirect bypass and hostile renderer egress | [GAP-007](gaps/GAP-007.md), [local fixes](gaps/GAP-101.md) | Library protections and offline OS/network isolation tested; independent live egress still required |
| Overflow, decompression/parser resource exhaustion | [GAP-102](gaps/GAP-102.md), [GAP-107](gaps/GAP-107.md) | Scoped local regressions closed; evolving libraries/address registries need [refresh](gaps/GAP-012.md) |
| Lost reservations, unknown completion and duplicate work | [GAP-005](gaps/GAP-005.md), [GAP-006](gaps/GAP-006.md) | Durable conservative accounting; no unsafe refund from inferred worker death; full runner absent |
| Rejected source reuse or agent self-recovery | [GAP-110](gaps/GAP-110.md), [GAP-015](gaps/GAP-015.md) | Current input restrictions and DB serialization tested; independent operational writer absent |
| Graph corruption or premature full-Twin claims | [GAP-026](gaps/GAP-026.md), [GAP-014](gaps/GAP-014.md), [GAP-016](gaps/GAP-016.md) | Narrow projections and literal claims; truncation defect tracked separately from full graph completion |
| Long-lived API submissions inherit expired deadlines | [GAP-025](gaps/GAP-025.md) | Concrete read-only defect ready for regression/fix; no owner-only dependency |
| Local global-lock throughput and audit-graph limits | [GAP-010](gaps/GAP-010.md) | Explicit fail-closed bounds/serialization, no production load claim |
| Stale guidance, unreviewed skills or model confidence as truth | [GAP-011](gaps/GAP-011.md), [GAP-012](gaps/GAP-012.md), [GAP-013](gaps/GAP-013.md) | Versioned contracts and registry controls; current released procedures/held-out evaluations still missing |
| Missing platform data interpreted as zero | [GAP-018](gaps/GAP-018.md) | Explicit missing-source projections; connector implementations/licensing/coverage remain |
| Strategy/territory or causal growth fabricated from local tests | [GAP-017](gaps/GAP-017.md), [GAP-022](gaps/GAP-022.md) | Ordering primitives and unknown outcomes; no ranking/revenue/cause claims |
| Silent website writes or expanded learning authority | [GAP-021](gaps/GAP-021.md), [GAP-023](gaps/GAP-023.md) | Disabled; explicit owner/privacy authority and independent safety evidence required |
| Static shell/decorative graph mistaken for finished product | [GAP-019](gaps/GAP-019.md), [end goal](01-END-GOAL.md) | Actual mobile/expert/Living Brain experience remains visible as open scope |
| Milestone/test count confused with product completion | [coverage](04-COVERAGE-MATRIX.md), [traceability](08-TEST-TRACEABILITY.md) | Separate full maturity, local scope, completion and gap lifecycle; no aggregate completion percentage |
| Vault becomes a competing or stale source | [GAP-027](gaps/GAP-027.md), [maintenance protocol](00-HOME.md) | Links rather than copied contracts; deterministic five-view refresh and consistency check; source hash is not test evidence |

Severity is conditional on exposure. A critical future-write gate does not stop safe read-only fixes; it prevents activating that authority. Risk acceptance cannot be inferred from passing fixture tests, an open PR or the existence of an ADR.
