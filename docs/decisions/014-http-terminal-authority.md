# ADR-014: independent HTTP terminal accounting authority

Status: Accepted reversible local engineering default.
Date: 2026-09-18.

GAP-005 exposes a missing accounting contract: the scheduler can settle its own HTTP reservation and directly update reservation/global lane rows. A worker's absence, lease expiry or self-authored byte count cannot establish termination. Canonical [30](../30-CRAWL-RENDER-CONTRACT.md), [33](../33-EVENT-JOB-CONTRACT.md) and [34](../34-SECURITY-TENANCY-DATA.md) require durable bounds, authenticated producers and separated worker authority.

Use a dedicated NOLOGIN-by-default HTTP supervisor database role for the local control-plane protocol. Generate a unique invocation identity at reservation, bind a process instance and immutable collector build/input context before execution, and accept one immutable terminal witness through the supervisor's narrow command. The scheduler cannot author that witness. Settlement references the stored witness and exact reservation/lease/attempt binding; it cannot provide its own actual-byte claim. Revoke direct settlement/counter-decrement privileges and expose bounded SQL transitions so bypassing TypeScript cannot bypass this boundary.

A terminal witness means the trusted supervisor observed process exit or confirmed termination and closure of its owned egress resources. It never means a timer merely expired, a heartbeat was missed, a lease was cancelled or worker JSON claimed success. Unknown decoded bytes stay unknown; worst-case byte and attempt charges are never refunded. A confirmed terminal receipt may release concurrency exactly once. Same transcript replay returns the original receipt; conflicting replay fails. Accounting can finish after cancellation/revocation without admitting results or restarting work.

An independent database service identity is simpler than adding a signing-key lifecycle for this same-host local protocol. Ed25519 signing would authenticate the signer, not prove process termination, and is unnecessary until independently transported receipts require it. Do not reuse skill reviewer keys, operator identity or scheduler credentials as supervisor authority.

Tests use an explicitly trusted supervisor fixture identity. This checkpoint does not install a real process/egress supervisor, enable collection or prove termination in production. The actual producer remains GAP-005/GAP-004 integration work. Do not grant this role to a collector or browser; they retain no database credentials. Production service identity/secrets remain deployment-gated.

Upgrade rule: never backfill a usable invocation identity into an older unknown reservation. Existing rows retain a null invocation identity; only new reservations receive one. Legacy unknown slots stay occupied and cannot gain a retrospective terminal witness even if their old job lease is still live. A future independently governed reconciliation path must prove termination rather than attaching a newly started process to old accounting.
