# ADR index

Acceptance is a design/authority disposition, not proof of full implementation or production readiness. [Decision register](../docs/24-DECISION-REGISTER.md) reconciles original R/D/S IDs.

| ADR | Recorded disposition | Source |
| --- | --- | --- |
| ADR-001: transactional domain core | Accepted engineering default for local first-slice implementation. | [001-transactional-domain-core](../docs/decisions/001-transactional-domain-core.md) |
| ADR-002: durable sql work | Accepted engineering default for local first-slice implementation. | [002-durable-sql-work](../docs/decisions/002-durable-sql-work.md) |
| ADR-003: runtime and contracts | Accepted engineering default for local first-slice implementation. | [003-runtime-and-contracts](../docs/decisions/003-runtime-and-contracts.md) |
| ADR-004: isolated perception | Accepted engineering default for local first-slice implementation. | [004-isolated-perception](../docs/decisions/004-isolated-perception.md) |
| ADR-005: replaceable reasoning | Accepted engineering default for local first-slice implementation. | [005-replaceable-reasoning](../docs/decisions/005-replaceable-reasoning.md) |
| ADR-006: data and activation | Accepted engineering default for local first-slice implementation. | [006-data-and-activation](../docs/decisions/006-data-and-activation.md) |
| ADR-007: explicit audit effects and affected scope | Accepted by the product owner on 2026-09-17. | [007-audit-effect-scope](../docs/decisions/007-audit-effect-scope.md) |
| ADR-008: local governed work authority and recovery | Accepted reversible engineering default under the owner's continuation instruction. | [008-local-governed-work](../docs/decisions/008-local-governed-work.md) |
| ADR-009: Fail-closed deployment profile and recovery gate | See Status section; accepted engineering default | [009-deployment-profile-and-recovery-gate](../docs/decisions/009-deployment-profile-and-recovery-gate.md) |
| ADR-010: Conservative public collection transport | Accepted reversible engineering default under the continuous implementation mandate. | [010-collector-egress-bounds](../docs/decisions/010-collector-egress-bounds.md) |
| ADR-011: Bounded discovery parsing | Accepted reversible engineering default. | [011-discovery-parser-conformance](../docs/decisions/011-discovery-parser-conformance.md) |
| ADR-012: isolated offline render conformance | Accepted reversible local engineering decision. | [012-offline-render-conformance](../docs/decisions/012-offline-render-conformance.md) |

ADR-007 is the owner-accepted scoped-rejection decision. Its implementation, transition fixtures and subsequent current-input enforcement remain distinct traceable checkpoints; see [M2](milestones/M2.md) and [N1](milestones/N1.md). No accepted ADR grants website-write authority.
