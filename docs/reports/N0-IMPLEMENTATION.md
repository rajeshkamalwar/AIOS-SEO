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

## Activation-boundary correction during N1 integration

Regression reproduced a fail-open `recoveryReadiness({})` result. The checklist now checks every required own field, rejects malformed/unknown shapes and requires literal true for every named check. These booleans remain a local checklist adapter, not independently authenticated deployed recovery receipts.

Production profile syntax is now explicitly distinct from activation authority: even a fully populated valid profile returns `production_activation_not_installed`. No signed deployment/recovery/egress activation adapter exists yet; populated strings cannot grant that authority. Nested OIDC fields and issuer URLs are validated without throwing, literal-secret equality cannot bypass secret-reference requirements, unknown fields fail closed, and identity-key separator injection is rejected. Local synthetic activation remains usable with a canonical hash. This correction preserves ADR-006 and makes the remaining N0 boundary honest; it does not select customer regions or data-use terms.

Verification: malformed-checklist regression failed before correction; all seven runtime tests and the full 264-test suite now pass. Typecheck/build/specification validation pass and the production dependency audit reports zero vulnerabilities.
