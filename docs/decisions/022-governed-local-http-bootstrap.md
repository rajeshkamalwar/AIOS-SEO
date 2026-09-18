# ADR-022: governed local HTTP bootstrap execution

Status: Accepted reversible local engineering default.
Date: 2026-09-18.

Under [30](../30-CRAWL-RENDER-CONTRACT.md), [33](../33-EVENT-JOB-CONTRACT.md), [34](../34-SECURITY-TENANCY-DATA.md) and [35](../35-QUALITY-SELF-AUDIT-GATES.md), an accounting lease alone cannot authorize collection. Extend the [isolated broker](020-local-http-egress-mediation.md) with one installed local bootstrap procedure. Public discovery remains a draft.

A current project lease may enqueue a separately governed fetch child. Derive its immutable GET /robots.txt descriptor exclusively from accepted same-run site scope in the parent's frozen evidence bundle. Authenticate the complete bundle manifest, exact canonical scope bytes, cutoff, freshness, current input/audit/deletion restrictions and source context. Reads outside transactions are bracketed by authority and fingerprint checks. Caller input selects only a trusted host fixture port, never a URL, headers, method or byte budget.

The installed deterministic http_bootstrap_fixture_v1 procedure requires exactly http.fetch_public@1.0.0 with max_calls=1 and local-synthetic-v1/discovery-v1 constraints. The fixed cap is512000 decoded bytes and20000ms. SQL enforces immutable child binding, exact origin/cap and cumulative one reservation across attempts, including failed, settled and uncertain invocations. Renamed accounting helper functions are not directly executable by scheduler roles. Generic enqueue/completion cannot create or complete this child.

The producer prepares authority before reservation/container creation and checks current authority before container start and broker socket dispatch. Heartbeat failure aborts execution. Independent socket and container termination remain necessary for settlement. Unknown termination retains capacity. SQL accounting is not network permission: the trusted producer must also apply source/audit/privacy gates. The older host-child supervisor remains an accounting test primitive, not installed governed dispatch.

The closed [operational receipt](../../spec/http-bootstrap-execution.schema.json) returns bounded metadata and evidenceAccepted:false. It proves neither accepted Evidence nor completed crawl work. No raw response is retained by this producer. Fenced result acceptance, persistent projected results, redirects/retries, public egress and host-loss reconciliation remain separate dependencies. This local fixture release does not authorize customer data, public traffic or website writes.
