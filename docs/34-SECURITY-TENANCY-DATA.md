# 34 — Security Tenancy Data

Status: restrictive implementation default. Real deployment privacy/region/provider approval remains an explicit activation gate; synthetic local development can proceed.

## Authentication and isolation

Production identity uses OIDC authorization-code+PKCE, issuer/audience/signature/nonce/state/expiry validation through a maintained library. Identity key is issuer+subject, never email matching. Browser uses opaque hashed server session with Secure/HttpOnly/SameSite=Lax cookie,8h absolute/30min idle expiry, CSRF token and Origin validation for commands. Mobile later uses PKCE with its registered redirect; no embedded client secret. Authentication implementation is separate from persistence milestone1.

Session-selected tenant must have active membership on every command/query. Owner administers membership/site lifecycle; editor submits/cancels discovery; viewer reads business projections; expert reads permitted diagnostics. Owners/editors may read their scoped business results; raw artifacts require owner or expert role. all_sites=false requires nonempty site IDs; none means deny, never wildcard. Membership revocation is immediately checked, no stale authorization cache. Public URL submission grants no ownership, verification or external write authority. Membership management cannot remove the last active owner except tenant deletion.

Tenant records carry tenant/site composite FKs and non-owner forced RLS. Runtime is not superuser, owner or BYPASSRLS. Authenticated scope is set transaction-locally; clear on commit/rollback and test pooled connection reuse. RLS is defense against omitted predicates, not against compromise of a service that can set scope. Workers receive only specific job leases, validate stored scope and never trust queue-provided tenant identity alone. Object reads go through authorized Evidence ID; no user-supplied object keys or public bucket URLs. Tenant-qualified caches, graphs, logs and model bundles receive the same checks. Global registry has no tenant artifacts.

Local profile allows synthetic fixture identities only, loopback server, no public crawling, no external models, no credentials, no customer data. It is a distinct fail-closed deployment mode, not a production fake-login switch. Startup outside that profile requires approved configuration including allowed processing region, storage/backup region, providers, retention, data use and operator identity. Missing fields block activation.

## Threat boundaries

Untrusted URL→egress policy→public collector; untrusted JS→OS-isolated renderer; untrusted text→model gateway; model candidate→domain validator; authenticated session→scoped API; operator→restricted release/deletion operations. Crawlers have no DB/model/provider secrets. Render worker receives only short-lived artifact upload capability for its assigned run. Network/proxy denies private ranges and bypass transports even if the browser library is compromised. 30 applies to redirects and subresources. Parse HTML inertly, disable XML external entities, escape all user-visible text, serve artifacts as downloads/inert text with nosniff and restrictive CSP.

Model output cannot edit policy, approve itself or create evidence. Secrets live in environment/secret manager references, excluded from prompts/events/logs. No private connectors are installed in the first slice. Support access default disabled; production break-glass requires owner-approved scope, reason, expiry≤1h, separate identity and full audit. No unrestricted support impersonation.

## Lifecycle

| Class | Synthetic profile / proposed pilot retention | Behavior |
| --- | --- | --- |
| Raw HTML/DOM/receipts | 7 days / 30 days | Private blobs; redact credential-like URLs; discard cookies/auth headers and form values |
| Derived Twin/assertions/bundles | 30 days / 180 days | Keep revision history, reference expiry explicit |
| Operational jobs/events | 30 days / 90 days | Compact traces, no page bodies |
| Audit metadata | 90 days / 365 days | IDs/operation/outcome only; minimize identifiable actor details |
| Identity | Until scope deletion | Disable access immediately; purge linked data by policy |
| Global skill/source registry | Version history subject to source rights | No tenant learning or customer artifacts |
| Backups | Local disposable / 35 days maximum | Encrypted and inaccessible to normal runtime |

Pilot values are proposed customer commitments requiring deployment-profile acceptance, not silently granted rights. Global learning/provider training is disabled; external model use requires approved no-training/data-retention terms and region. Public pages can contain personal information; minimize to business-relevant text, never collect patient/customer form submissions.

Deletion first records an epoch/tombstone in independently retained deletion ledger, suspends tenant/site, revokes sessions, cancels jobs and denies reads. Enumerate DB rows, blobs/versions, caches, publications and provider-held permitted derivatives; delete within24h active stores, backups by35-day limit. Retain only minimal ledger IDs/epoch for restore filtering until all restorable copies expire. A restored database is quarantined until latest ledger replay, artifact reconciliation and scope probes pass. No delete success until all active-store receipts pass; failed cleanup is visible/retryable. Derived facts do not survive source deletion as “verified” evidence.

Security acceptance requires two tenants same URL, forged reference, pool reuse, stale membership, deleted tenant late worker, object-key traversal, injected page, DNS rebind/private redirect, blocked POST/subresource and restore-after-deletion cases. Local tests do not establish production sandbox safety or compliance.

## Local rendered-artifact minimization

[ADR-018](decisions/018-local-render-evidence-retention.md) defines a local-only privacy-limited DOM projection before artifact upload. Its [retained manifest](../spec/offline-render-retained-manifest.schema.json) distinguishes transient original hashes from transformed Evidence bytes and declares suppressed coverage. Denied resource URLs are withheld. This does not certify arbitrary-secret removal, raw HTTP fixture retention, complete DOM parity or customer activation. A separate collection-service acceptor credential authorizes retained Evidence; scheduler and renderer credentials cannot invoke that acceptance function.
