# ADR-007: explicit audit effects and affected scope

Status: Accepted by the product owner on 2026-09-17.
Date: 2026-09-17.

## Context

M2 in document 38 requires the critical runtime controls in documents 33 and 35. The pre-implementation review found conflicting audit semantics:

- Document 35's publication transaction permits independent supported observations to publish as partial after affected conclusions are suppressed.
- Document 35's rule mapping says A02/A07/A08/A11 reject affected stale or invalid outputs.
- `spec/quality-gates.json` assigns `quarantine` to both failure and unknown for all four rules.
- `SelfAuditResult.effect` permits only `allow`, `degrade`, and `quarantine`. Its scope fields identify a tenant, site and crawl; there is no explicit affected-output set or quarantine target.
- Document 21 also describes A08 as quarantine of the queue and active derived outputs. A release revocation must therefore still stop every job and conclusion that depends on that release, irrespective of the partial-publication decision.

No explicit contract establishes whether quarantine here means an affected output/dependency set or the entire run. Choosing either implicitly would change publication availability and operator recovery obligations. Passing schema examples cannot resolve that behavioral discrepancy.

## Decision

Distinguish `reject_outputs` from `quarantine_run` explicitly. A02/A07/A08/A11 suppress the affected outputs and their dependent conclusions; independent supported results may continue only after their own required gates pass. Integrity failures quarantine the affected run/publication. Missing or unresolvable impact scope must not permit publication.

Release revocation continues to deny admissions, dispatch and acceptance for every dependent mission immediately. Rejection never grants permission to continue a revoked mission. Existing independent evaluation and operator-reviewed recovery requirements remain; an agent cannot clear its own restriction.

Documents 21/35, the versioned quality rule artifact and SelfAuditResult schema/catalog are reconciled as rule version 1.1.0 and schema version 2. The affected-reference representation and transition fixtures are part of the accepted contract. Released rule versions remain immutable.

## Alternative

Quarantine the entire affected run for A02/A07/A08/A11. This is conservative about publication but prevents otherwise supported partial results and expands operator recovery work. If selected, amend document 35's rejection/partial-publication language accordingly and make the run scope explicit in the machine contracts.

## Required verification after a decision

Test failure and unknown separately for each affected rule; rejection or quarantine must persist across restart. Verify unsupported outputs never publish, independent output behavior matches the selected policy, revoked work cannot dispatch or commit, absent receipts fail closed, and only independently verified operator recovery can lift quarantine. Tests must assert the chosen scope, not just the effect string.

This decision neither activates real skills/models nor changes external authority or data policy.

Implementation representation: quality rules version 1.1.0; SelfAuditResult schema_version 2 adds scope (`outputs` or `run`), scope_complete, dependency_snapshot_hash, direct_output_ids, affected_output_ids, and recovery_of_id. References are same-site persisted record IDs, normalized as ordered links. `reject_outputs` applies only to a complete dependency closure; unknown/incomplete scope escalates to `quarantine_run`. Existing version-1 shape remains available as SelfAuditResultV1 in the audit contract schema for historical decoding only. New acceptance requires version 2.
