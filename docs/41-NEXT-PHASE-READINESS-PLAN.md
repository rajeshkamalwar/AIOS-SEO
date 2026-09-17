# 41 — Next-phase readiness and implementation plan

This plan follows the post-M5 review and preserves the read-only boundary. It is an implementation sequence, not authorization for website writes or private search connectors.

## Phase N0 — deployment and operational foundation

Create an approved deployment profile: processing/storage regions, retention and deletion commitments, provider data-use terms, operator/reviewer identities, secret management, backup/PITR, restore drills, alert ownership and incident escalation. Replace the fixture principal with OIDC authorization-code+PKCE and server sessions. Run tenant-isolation, deletion-after-restore and support-access probes in the deployed topology.

Exit evidence: signed deployment profile, security review, restore/deletion drill receipts, session/CSRF tests, private blob adapter tests and an operator-owned recovery runbook. Until this exits, customer URLs remain blocked.

## Phase N1 — real public perception

Implement the HTTP collector behind controlled egress with DNS/IP pinning, redirect revalidation, response/total budgets, origin fairness and durable CrawlTarget/PageSnapshot acceptance. Add a separate Linux nonroot Playwright worker, pinned browser/container versions, network-deny probes, resource caps and crash-resume tests. Keep robots/sitemap uncertainty and partial accounting explicit.

Exit evidence: fixture-server and adversarial network corpus, SSRF/DNS-rebinding/private-redirect tests, robots/sitemap/parser corpus, 750-attempt budget accounting, renderer escape/egress probes and independently reviewed raw/render evidence. No business inference is added in N1.

## Phase N2 — evaluated reasoning and Twin publication

Assemble the frozen held-out cohorts and labels required by document 35. Add one provider adapter only after data-region/no-training terms and budget routing are approved. Validate model outputs against immutable bundles, locators, scope, temporal cutoff and unsupported-claim rules. Implement full BusinessTwin/TwinAssertion, capability assessment, DecisionRecord and graph publication through independent evaluator receipts.

Exit evidence: required precision/recall and unsupported-claim thresholds by cohort, injection/privacy tests, model replacement test, audit receipts, correction history and tenant-scoped publication restart tests. A failed or unknown gate suppresses or quarantines according to ADR-007.

## Phase N3 — controlled pilot

Run a small approved pilot with read-only public URLs. Measure collection coverage, parser/render failure classes, latency, cost reservations, support burden, deletion completion and customer interpretation quality. Do not add Search Console/Bing/analytics/SERP or website actuators until each connector has its own contract, permissions, correction fixtures and privacy approval.

Exit evidence: pilot review against declared denominators and SLOs, no fabricated metrics, no unresolved isolation findings, successful deletion/restore rehearsal and explicit go/no-go from accountable operators.

## Deferred work

Website modifications, approvals for external writes, experiments, causal outcome learning, global learning, private search integrations and the 3D/expert visualization remain separately scoped. They cannot be smuggled into N1–N3 as “integration” work.

## Current blockers

The blockers are operational authority and security-boundary gates, not reversible implementation choices: approved deployment/data policy, production identity/operator ownership, and isolated live perception infrastructure. The local architecture does not need to be redesigned to proceed with N0; it needs those explicit approvals and evidence.
