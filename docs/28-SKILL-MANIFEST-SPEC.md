# 28 — Skill Manifest Spec

Status: canonical manifest shape in [skill.schema.json](../spec/skill.schema.json). Examples are draft contracts, not approved skill releases. Source capture hashes in spec/sources identify retrieved revisions; retained short excerpts alone do not encode an entire SEO rulebook.

The eight packs in 16 are retained. A ninth `seo.sitemap-reconciliation` separates inventory comparison from network discovery because these have different evidence sufficiency. Crawl/directives, canonicals, robots, sitemap, parity, internal links and business inference are covered by these packs, not nine mandatory agents.

## Execution semantics

Procedure is ordered; every step consumes its named input kind and emits output_kind. operation resolves to a versioned, installed handler; unknown names fail admission. `executor=model` is only valid for a model.infer_scoped step. No eval, shell, SQL or arbitrary URL execution from procedure text. Each handler's deterministic validation must run even if the prior step used a model. Tool permissions intersect mission, tenant policy and remaining budget. Output schemas resolve only from the local registry; remote schema fetching is prohibited.

First handler registry:

| Operation | Deterministic procedure / output |
| --- | --- |
| discover_v1 | 30 admission, robots and frontier accounting → Crawl summary |
| directives_v1 | Extract raw/header/render source-specific directives, retain conflict; eligibility unknown when evidence absent → observations/claims |
| canonical_v1 | Resolve declarations against response URL and observed base; compare observed targets, never merge URLs → assertions |
| sitemap_v1 | Compare observed sitemap members with observed response/directive/canonical evidence; unvisited targets unknown → assertions |
| parity_v1 | Matched timed snapshots; compare text/link/metadata, retain policy-limited status → assertions |
| business_v1 | Structured evidence-only field extraction/inference; unsupported field abstains → inference output |
| structure_v1 | Typed link extraction and bounded paths; no true orphan without independent complete inventory/link coverage → assertions |
| opportunities_v1 | Filter unsupported relevance; deduplicate same incident; order protection, identity conflicts, missing context, follow-up; stable UUID tie-break, max3 → opportunities |
| reliability_v1 | Evaluate fixed checks in 35; cannot grant authority → SelfAuditResult |

These handlers may orchestrate several listed tool calls. Null tool_id means deterministic internal transformation only. Discovery uses a scope evidence receipt before any remote collection; thus it does not need crawl evidence to bootstrap. Retry/partial behavior is declared per step and bounded by 33. A first-site observation cannot be admitted by a model-invented Site record.

The local prerequisite [scope-receipt.schema.json](../spec/scope-receipt.schema.json) records server-derived Site/Crawl/submitter identity, normalized submitted scope, policy/profile, deletion epoch and expiry. Its JSON is retained as internal-policy Evidence with a `site-scope` Observation; it is not an HTTP observation. This receipt is explicitly fixture-only, establishes no ownership and grants no live dispatch or website-write authority. It is idempotent per run only while current authorization, work/deletion fences, deadline and policy checks still pass. Freezing it into a bundle supplies a traceable bootstrap input; it never replaces current dispatch authorization, independently approved releases, robots eligibility, budgets or deployment approval.

## Immutable release and mutable eligibility

Release key is (skill_id,version,digest). Never overwrite bytes. Manifest status is its creation snapshot; release_state journal supplies current eligibility with monotonically increasing generation. Admission, each tool dispatch and publication recheck current status, transitive rule validity, policy and scope. Revoked releases have no grace period. Deprecated releases stop new admissions; existing bounded reads may finish only before deadline under unchanged authority. A replacement starts a new mission and revalidates inputs.

A signed release approval record contains author, reviewer (different human), manifest digest, evaluation-report digest, approved_at and scope; test-only identities never activate real collection. Approval is an operational gate, not a requirement to ask the product owner about every parser choice. Daily checks for directive/canonical/render eligibility guidance; weekly for protocols; monthly for descriptive context. New authoritative publication requires successful applicable rule verification within 24h for daily rules, seven days for protocols, 30 days for context. Unreachable source yields degraded freshness; it does not silently update last_verified. Changed rule creates a new source/rule release and re-evaluation of dependent current conclusions.

All manifest examples pin captured source revisions, forbidden effects, declared procedures, output schemas and fixture IDs. Rule interpretation and independent release evaluation remain necessary before promotion. Static shape validation is never reported as skill accuracy. No release is automatically approved because this document exists.

## Installed local offline-render prerequisite

[ADR-017](decisions/017-governed-local-render-execution.md) adds the fixed `offline_render_v1` synthetic handler with exact `render.observe@1.0.0` permission and immutable snapshot-specific child input. Its [draft fixture](../spec/examples/skill-offline-render-fixture.json) is not a released parity Skill or SEO evaluation. The [operational receipt](../spec/offline-render-execution.schema.json) explicitly accepts no Evidence; canonical tool/domain result acceptance and job completion remain subsequent gates. Internal typed preparation reads do not expose a generic artifact tool.
