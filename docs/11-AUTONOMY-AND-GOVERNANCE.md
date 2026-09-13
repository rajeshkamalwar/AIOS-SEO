# 11 — Autonomy and Governance

Status: proposed enforceable safety contract; risk thresholds and accountable owners require acceptance in 13.

**The Brain may reason freely, but it acts only through governed skills and explicit tools.**

Free reasoning means it can consider alternatives and challenge assumptions. It does not mean unlimited compute, data access, credential access or authority. Observation tools also consume budgets and can expose data; they remain governed.

## 1. Authority path

An agent submits a structured capability request. The Skills Runtime checks the pinned release and procedure stage. The Policy Enforcement Point validates identity, scope, current grants, proposal hash, preconditions, budgets, policy/skill status and risk route. Only the Tool Gateway can obtain the narrowly scoped credential and call an external capability.

The Policy Guardian agent can explain risk or identify missing evidence. It cannot issue itself privileges, override deterministic blocks, or serve as the sole approval mechanism. Credentials and write network access are absent from model workers. Denial, uncertainty or unavailable enforcement fails closed for writes.

Global policy sets a floor; tenant/site policy may restrict it. Customer approval cannot override prohibited practices or missing asset authority. Search spam/manipulation remains prohibited, including scaled content abuse and link spam as defined by applicable platform policy. [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies).

## 2. Permission and risk are separate

| Route from 05 | Proposed eligibility | Required authority |
| --- | --- | --- |
| Auto | Evaluated skill/connector cohort, fresh evidence, narrowly bounded and reversible effect, no protected-asset breach | Explicit active tenant/site grant for capability, limits, expiry and budget |
| Review | Ordinary bounded change with useful preview and tested recovery | Authorized customer/operator approves exact proposal |
| Expert Review | High impact, difficult recovery, ambiguous evidence, regulated claims, template/navigation or indexation consequences | Qualified expert review plus target owner's applicable authorization |
| Block | Prohibited tactic, wrong tenant, no asset control, stale/revoked authority, unknown essential preconditions, unsupported capability | Cannot execute; new evidence or redesigned proposal may allow reassessment |

Initial external mutation mode: Review at minimum. Auto is disabled until the cohort-specific acceptance gate exists. A title change is not inherently low risk: one template edit may change every page; a single page may produce most revenue.

Risk assessment records blast radius (including dependencies), asset value, effect severity, policy exposure, reversibility, detectability, evidence sufficiency, connector reliability and cost. Hard limits precede scoring. High-blast-radius work never silently auto-deploys. Migrations, robots/noindex/canonical changes, mass deletions and global template edits require explicit expert routing and bounded rollout design.

Read-only collection needs appropriate scope, rate limits and data-use policy, but should not demand website write verification merely to provide provisional public discovery.

## 3. Skill and tool contracts

A SkillRelease includes immutable ID/hash, semantic version, owner, approved status, knowledge dependencies, applicability, input/output schemas, evidence requirements, allowed tool capabilities, procedure, stopping conditions, validations, risk bounds, evaluation suite, expiry/recheck rules and compatible tool schemas.

Release lifecycle: draft → evaluated → approved → deprecated/revoked. Deprecated releases may finish only under explicit policy; revoked releases cannot start new side effects. No executing agent can publish its own replacement procedure.

A tool capability declares:

- Typed input/output and schema version; target resource and allowed network scope.
- Required principal/site/connector permissions and data classifications.
- Read/write effect category, preconditions and conditional-write support.
- Idempotency support, receipt/reconciliation method, rate and budget limits.
- Partial failure behavior, retry classification and cancellation limitations.
- Preview mechanism, verification method and compensation capability.
- Audit fields and secret-redaction rules.

Tools with no safe reconciliation cannot be used for unattended writes. Arbitrary shell, SQL, CMS admin or unrestricted browser actions are not substitutes for capability contracts.

## 4. Approval binds an exact artifact

The proposal must include an exact machine-readable diff and a business-readable preview, target scope/environment, before-state version/hash, evidence manifest, skill release, policy assessment, expected effects, affected protected assets, rollout bounds, verification and compensation plans.

ApprovalGrant binds tenant, approver, role, proposal hash, target, precondition digest, allowed capability, expiry and maximum uses. Grant checks are authoritative server-side. If the diff, target, material evidence, skill validity or relevant policy changes, re-assess and issue new approval where required.

A user approving a mobile card approves that version only. Offline taps are pending intents; reconnect revalidates current identity and proposal before creating authority. Batch approval lists exact actions and collective blast radius; it is not a wildcard.

Delegated permissions have expiry and revocation. Site ownership, customer account membership and CMS access are separate checks. Expert access is scoped and auditable; support access is time-bounded and visible.

## 5. Safe deployment and compensation

1. Recheck grants, stop flags, skill/policy validity and target before-state.
2. Reserve the resource scope with fencing and write an attempt record.
3. Dispatch the typed change with stable idempotency key and expected remote version.
4. Record receipt; independently inspect actual target state.
5. Verify exact intended changes and protected technical/business invariants.
6. Monitor guardrails and schedule delayed search/business measurement.
7. If needed, execute a separately governed conditional compensation.

Reversibility categories: exact conditional inverse, compensating change, manual recovery, or irreversible effect. Store before-state and rollback artifacts securely before deployment. Compensation only applies if current state still matches the state being reversed; human edits create a conflict requiring reconciliation. Do not restore an entire site backup over unrelated changes.

An unknown write outcome pauses conflicting work and invokes reconciliation. Multi-resource writes have per-resource receipts and partial status; use staged rollout and compensation, not a false cross-provider transaction. Search submission, external crawling, publication exposure and ranking effects cannot be reliably undone by reverting content.

For a git-based target, a reviewed patch/branch can be the actuator; merge/deploy authority is distinct. For CMS targets, establish content version checks and preview fidelity. Unsupported execution connections remain recommendation-only.

## 6. Stop controls and earned autonomy

Global, tenant, site, connector and skill stop flags are enforced at dispatch, not merely in the UI. They halt new writes and signal running work. In-flight external requests may complete; reconcile them. Emergency compensation requires predefined authority and current preconditions, not an unrestricted bypass.

Autonomy grants are earned per skill × connector × action class × risk cohort, not per agent personality. Required evidence includes offline correctness/security checks, shadow proposals, reviewed deployments, verified recovery and frozen reliability thresholds. Sample sizes and acceptable error bounds must be agreed before promotion. A clean result on one CMS does not qualify another.

Regression, stale guidance, rising failure rates, unresolved effects or missing audit evidence can suspend Auto automatically. Self-audit may lower authority; raising it requires independent approval.

## 7. Security and isolation beyond database rows

Enforce tenant scope across database constraints, object storage access, queues, workflow arguments, caches, graph queries, embeddings, exports, notifications and model context. Never use user-supplied tenant IDs as sufficient identity. Integration webhooks need verified signatures or provider-appropriate authenticity controls and replay protection.

Crawler and renderer workers process hostile pages. Restrict public HTTP(S) destinations; block private/loopback/link-local/metadata endpoints, including DNS rebinding and redirects. Revalidate every destination and browser subresource; cap response sizes, decompression, redirects, execution time and downloads. No production credentials in crawl sandboxes. Browser profile isolation alone is not an operating-system security boundary.

Page text, structured data, search results and tool responses are untrusted data, including instructions to alter policy or exfiltrate context. Keep them outside authority channels; validate all proposed calls against capabilities. Bound extraction, sanitize displayed HTML, and test injection attempts that originate in pages, documents and provider responses.

Classify customer business records, analytics, personal data, secrets and public guidance separately. Define region, retention, deletion, backups and model-provider data-use constraints before production. Deletion propagates to derivatives, indexes, model caches and recoveries; preserve only allowed audit metadata. Never silently use customer data for provider training or global learning.

## 8. Mandatory pre-write validation scenarios

Unauthorized tenant reference; stolen/expired approval; modified proposal; replayed approval; skill revocation while queued; spoofed webhook; malicious page instruction; private-network redirect; crash after remote success; partial batch; concurrent human edit; compensation conflict; kill switch during execution; object/graph/vector cross-tenant access; restore after deletion.

These are future acceptance requirements, not claims that tests have already been implemented or passed.
