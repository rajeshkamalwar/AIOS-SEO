# M2 implementation report

Date: 2026-09-17.
Baseline: `cca89edfa13b5875bc5b3f5b8007ecca87b5fd01` on `codex/m1-evidence-ledger`, implementation PR #2, stacked on specification PR #1.
Status: **Blocked during specification review; M2 is not implemented or accepted.**

## Authorization and scope

The current user instruction authorizes sequential work through M5, conditional on each milestone passing all acceptance criteria and no genuine blocker. It supersedes the historical M1-only stopping instruction. It does not authorize choosing missing governance behavior silently.

M2 remains durable governed work: leases, reservations, cancellation/deletion fences, release registry and audit. No website collection belongs in this milestone.

## Referenced contracts reviewed

Re-read AGENTS.md, README, document 38, documents 25/26/28/32/33/34/35/37/39 and ADRs 001–006. Cross-checked document 21, job and mission schemas, the quality rule artifact, and SelfAuditResult's machine fields. This was a pre-implementation gate review, not a claim of re-reading every repository document or passing M2 runtime tests.

## Genuine blocker: audit effect and scope conflict

Document 35, lines 7 and 15, permits supported partial publication and says A02/A07/A08/A11 reject affected stale/invalid outputs. The machine rule artifact says `quarantine` for both failure and unknown for these checks. SelfAuditResult has no rejection effect and no explicit affected-output or quarantine-target field. Document 21's A08 queue/output quarantine adds a dependency scope that must remain enforced.

The missing distinction determines whether an otherwise valid independent result may publish and whether the entire run must await operator recovery. Implementing one interpretation as if unambiguously specified would invent governance behavior. It prevents the M2 exit requirement, “33/35 critical runtime controls pass,” from having a single authoritative expected result.

[ADR-007](../docs/decisions/007-audit-effect-scope.md) records the discrepancy, recommended scoped rejection and alternative run quarantine. It remains **Proposed**, pending the requested decision. No application code or accepted rule was changed to choose an interpretation.

## Actual verification

A direct JSON inspection reproduced:

| Check | Machine failure effect | Machine unknown effect | Document 35 mapping |
| --- | --- | --- | --- |
| A02 | quarantine | quarantine | reject affected outputs |
| A07 | quarantine | quarantine | reject affected outputs |
| A08 | quarantine | quarantine | reject affected outputs |
| A11 | quarantine | quarantine | reject affected outputs |

SelfAuditResult.effect permits `allow`, `degrade`, `quarantine`; target fields identify tenant/site/crawl/check. This inspection proves a contract gap, not a runtime failure.

No M2 runtime tests, acceptance or performance results are claimed. M1's previously recorded 51 passing tests remain historical results; they do not establish M2 correctness. The documentation-only update passed the offline specification validator (18 schemas, 952 references, 31 positive and 4 negative examples, 48 records, 13 artifact hashes, 6 source excerpt hashes, 9 skill manifests and 101 document links) and Git whitespace checks. The validator does not detect this semantic governance conflict.

## Next action

Resolve ADR-007, reconcile/version the affected contracts, then implement and test M2 on this same PR. Subsequent milestones remain authorized conditionally; M3–M5 have not started. No routine progress relay or new implementation task is needed.
