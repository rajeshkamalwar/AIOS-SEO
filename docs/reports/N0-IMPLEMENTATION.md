# N0 implementation report

## Scope

Added explicit deployment-profile activation, a local synthetic authentication adapter, issuer-plus-subject identity keys, and a fail-closed restore readiness check. No external credentials, customer URL activation, or website-write capability was added.

## Evidence

- Local profile accepts only `local-synthetic-v1` with no production fields.
- Production activation reports all missing operational requirements and rejects invalid OIDC/operator configuration.
- Recovery remains quarantined until all independent checks pass.
- Tests cover the local adapter, production fail-closed behavior, identity-key semantics and recovery transitions.

## Remaining N0 exit requirements

An approved deployment/data-use profile, production OIDC ownership, backup/PITR and restore receipts, support-access policy, and deployed tenant/deletion probes remain operational prerequisites. They cannot be fabricated by this repository.
