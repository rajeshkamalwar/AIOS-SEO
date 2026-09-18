# ADR-009: Fail-closed deployment profile and recovery gate

## Status
Accepted

## Context

The repository can run a local synthetic read-only slice, but production identity, data-region commitments, provider terms, backups and recovery ownership are not available in source control. Treating missing operational facts as defaults would make customer URLs appear operational without the required authority or privacy evidence.

## Decision

Represent activation as an explicit deployment profile. The local profile is limited to synthetic identities and contains no production configuration. Production activation requires regions, retention/deletion and provider-use policy identifiers, separate operator and reviewer identities, secret references, backup policy/runbook, and HTTPS OIDC configuration. Missing or inconsistent fields fail closed. Recovery is quarantined until deletion-ledger replay, artifact reconciliation, tenant-isolation probes and a restore receipt all pass.

The repository ships only a local synthetic authentication adapter. It does not claim production OIDC readiness or create external credentials. Identity keys remain issuer plus subject.

## Consequences

This keeps the current read-only path runnable and makes the production boundary machine-checkable. An approved deployment profile and independently owned recovery evidence remain required before customer URLs or live external perception are enabled.
