# ADR-013: suppress unverifiable legacy publications

Status: Accepted reversible engineering default under the continuation mandate.
Date: 2026-09-18.

The local M5 publication table stores JSON without an independently verified evaluator receipt, crawl linkage, dependency closure or release binding. Its runtime INSERT privilege permits ungoverned output. Schema conformance and tenant isolation of the outer row cannot establish embedded reference authority or satisfy [35](../35-QUALITY-SELF-AUDIT-GATES.md).

Revoke service-role writes to this legacy table. The read adapter authorizes the exact site, checks the independently retained deletion ledger, and queries existence only. No row yields projection_pending; an unverifiable legacy row yields policy_blocked. Never load or expose its cards, graph, identifiers or raw JSON. Preserve rows as historical artifacts. Do not add a fixture bypass, trusted Boolean or agent-authored approval.

This enforces the existing missing-gate and unknown-dependency-scope rule from [ADR-007](007-audit-effect-scope.md); it changes no product authority. A future independently governed publication writer must satisfy the existing evidence, temporal, release, evaluation and recovery contracts before restoring successful persistent projection reads. This is suppression, not recovery, and does not close GAP-015/GAP-030 or claim publication delivery.

The alternative—continuing to expose legacy JSON while planning the writer—would normalize a known security boundary violation. Inventing a caller-supplied receipt would merely rename the defect. Local implementation and isolated tests continue without customer data or website writes.
