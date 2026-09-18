# AIOS-SEO control vault

Open the **repository root** as the Obsidian vault. This directory is a linked control layer, not a second specification. No Obsidian plugin is required. The repository is the knowledge vault; do not create or populate a second nested vault.

Start with [AGENTS](../AGENTS.md), [README and canonical reading order](../README.md), then [end goal](01-END-GOAL.md), [current state](03-CURRENT-STATE.md), [coverage](04-COVERAGE-MATRIX.md) and [gaps](05-GAP-REGISTER.md). Continue through [system map](02-SYSTEM-MAP.md), [milestones](06-MILESTONE-TRACKER.md), [ADRs](07-ADR-INDEX.md), [tests](08-TEST-TRACEABILITY.md), [risks](09-RISK-REGISTER.md) and [references](10-REFERENCES.md).

Canonical documents, machine contracts, code, tests and implementation reports remain authoritative for their respective claims. Resolve a mismatch at its source and record the gap. A vault status cannot override a specification, grant authority or certify code. Historical reports retain their original dates and limitations. All 195 catalog rows have linked capability notes; capability notes reference requirements rather than copying them.

## Maturity and completion are different

| Maturity | Evidence required for the named scope |
| --- | --- |
| NOT_DEFINED | No accepted behavior/contract identified; record the missing contract |
| DEFINED | Canonical responsibility/contract exists; not an executable release |
| IMPLEMENTED | Identified code covers the stated scope; validation may be missing |
| TESTED | Identified automated tests passed for the stated scope and environment |
| REAL_WORLD_VERIFIED | Authorized real observations validate the capability on its declared cohort/context, with retained evidence and independent review |
| PRODUCTION_PROVEN | Deployed operation over declared windows/denominators establishes reliability, isolation, recovery and product usefulness |

These labels are not additive percentages or a marketing readiness score. Fixture, loopback and offline-browser testing is TESTED, never REAL_WORLD_VERIFIED. Real PostgreSQL/Chromium execution does not by itself verify an SEO capability against the real world. A tested primitive is recorded separately from the full canonical capability. Unknown or absent evidence cannot advance a stage.

**Definition of Complete:** completion is a separate field, never a synonym for IMPLEMENTED or TESTED. A capability may be COMPLETE only when its required applicable stages are explicitly identified from the canonical contract, each has retained passing evidence for the declared scope/cohort, required releases and authority gates pass, and no unresolved critical/high gap affects it or its dependencies. Any exclusion requires an explicit canonical applicability basis. Real-world proof is not production proof. No capability is marked COMPLETE at baseline. A completed local milestone does not close its remaining product-scope gaps.

## Gap lifecycle

`OPEN → FIX_IN_PROGRESS → FIXED → TESTED → VERIFIED → CLOSED`

Every gap has a permanent ID, scope, severity, evidence, owner role, closure criteria and append-only history. FIXED means a correction exists; TESTED means its named tests pass; VERIFIED requires review against the original scoped defect; CLOSED requires that scoped verification and no unresolved closure condition. Closing a local defect never closes a broader deployment risk. Preserve historical imports at the last evidenced stage; never invent missing transition dates. If a closed issue recurs, append a reopening entry referencing prior closure; never delete its history.

## Milestone update protocol

1. Read the milestone's linked canonical specifications and ADRs.
2. Update its note, impacted capability notes and persistent gap histories with actual code/test/report evidence.
3. Run `npm run vault:update`. It regenerates CURRENT-STATE, COVERAGE-MATRIX, GAP-REGISTER, MILESTONE-TRACKER and TEST-TRACEABILITY together from these records.
4. Run `npm run vault:check` and required implementation checks; record exact results and limitations in the existing report. Use `python3 vault/refresh.py --check --base <checkpoint>` to reject a code/test checkpoint missing updates to any of the five views.
5. Commit/push the checkpoint and verify remote state. Update the next note with that commit; do not put a self-referential current-commit hash into its own contents.

The generator updates navigation and evidence indexes, **never promotes maturity or closes a gap automatically**. The normal test entry point checks vault consistency. Maintenance is part of implementation, not a reason to stop it. Owner gates block only the dependent work; safe local corrections continue.
