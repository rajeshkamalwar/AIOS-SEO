# 25 — Physical Domain Schemas

Binding first-slice contracts: [domain.schema.json](../spec/domain.schema.json), [storage.catalog.json](../spec/storage.catalog.json), [common.schema.json](../spec/common.schema.json). JSON Schema 2020-12 defines required/optional fields, enums, value shapes and rejection of unknown properties. The catalog defines table names, ownership, uniqueness and indexes. This is a storage specification, not migrations or application code.

## Representation and invariants

Use PostgreSQL 17 typed tables. Map UUID→uuid, UTC timestamp→timestamptz, integer counters→bigint with nonnegative CHECK, booleans→boolean, bounded strings→text with length checks, fixed digests→64-character lowercase hex with CHECK. Closed structured objects such as support/budget/error use JSONB validated by the same schema. Arbitrary free-form JSON fields are prohibited. Relationship/reference arrays are normalized ordered join rows, not unvalidated UUID arrays. Non-reference string lists can use text[]. Raw HTML/DOM lives in blob storage; relational rows contain hashes/locators, never duplicate full bodies.

Every tenant record has `(tenant_id,id)` primary key and a `record_index(tenant_id,id,record_type,site_id)` identity row. Typed records reference this spine with a matching record_type CHECK/trigger. Polymorphic references target the spine with the same tenant; typed references additionally require the declared target type. Global User/registry records have global UUIDs and their own tables, not nullable-tenant rows in ordinary tenant tables. IDs are server-generated UUIDv4, never derived from a public URL or model output. Sharing a URL across tenants cannot share records.

All rows require record_type/id/schema_version/version/created_at/recorded_at/updated_at/deleted_at/state/retention_class/provenance_ids. Tenant/site fields are required according to catalog scope; Site.site_id equals Site.id. `version` is optimistic concurrency for mutable rows; immutable revision rows have fresh IDs, stable `series_id`, and unique `(tenant_id,series_id,version)`. created_at is record creation, recorded_at is acceptance transaction time; immutable payloads have updated_at=recorded_at. Setting superseded_at and deletion/redaction metadata are the only allowed updates to immutable records, with an AuditEvent. Temporal fields and interval rules are in 26.

Create `record_link(tenant_id,owner_id,field_name,ordinal,target_id,target_type)` for listed reference arrays, unique owner/field/ordinal and owner/field/target; same-tenant FKs to record_index and type validation. Delete/revoke operations operate through domain commands and 34's deletion ledger. No ON DELETE CASCADE from one Evidence row may silently erase a decision; expiration retains an inaccessible-artifact marker until the derived record itself expires. Full tenant purge removes all scoped records and derivatives in deletion order.

`provenance_ids` references Evidence/Observation/EvidenceBundle/AuditEvent in the same tenant; identity records may have an empty list with an actor-created AuditEvent instead. Global registry provenance uses source manifests via release hashes; their provenance_ids is empty. All site-scoped FKs additionally match site_id unless explicitly cross-site Business/Member; first-slice cross-site traversal is disabled. User.id is the only ordinary global principal link. Registry IDs/versions are read-only global references, never a private-data join path.

## Record-specific relationships and lifecycle

The schema and catalog supply exact typed fields for every row below; unlisted optional fields are forbidden. State names here refer to the exact enums in the schema. Indexes below supplement the catalog's primary, site/time and temporal indexes.

| Record | Foreign keys / uniqueness and interpretation | Deletion / retention |
| --- | --- | --- |
| Tenant | id isolates billing/work; policy_profile_id resolves approved configuration; deletion_epoch fences all workers | Identity class; purge on tenant deletion |
| User | unique issuer+subject; identity provider credentials never stored | Identity; disable user without deleting other tenants' history; pseudonymize display identity |
| Membership | user→User; scope IDs→Site; unique tenant+user; all_sites=false requires nonempty scoped sites | Revoke access immediately; identity retention |
| Business | tenant-owned organization; confirmed_by_user→User requires current authorized membership | Identity; no delete while active sites reference it except full purge |
| Site | business→Business nullable until provisional inference; unique tenant+normalized_origin | Identity; archive stops new work, delete propagates |
| SiteOwnership | one current proof per site/method; proof→Evidence; verified requires timestamp, expiry and proof; never grants writes | Identity; proof expiry and revocation preserved |
| Crawl | actor→User, input hash/idempotency per tenant; site exists; stage and terminal state guard 33 | Operations; completion immutable, subsequent run new ID |
| CrawlTarget | crawl→Crawl; discovered_from→CrawlTarget nullable; unique crawl+url_key; admitted/state guards 30 | Operations; purge with crawl/tenant after retention |
| Page | unique tenant+site+url_key; different canonical targets never collapse identity | Derived; retire when only historic observations remain |
| PageSnapshot | page→Page,crawl→Crawl,observation→Observation,evidence→Evidence; unique observation | Raw; expiration preserves hash metadata only as permitted |
| RenderSnapshot | page_snapshot→PageSnapshot,observation→Observation,evidence→Evidence; one sample offset per render observation | Raw; independent of raw snapshot lifetime |
| ResourceObservation | optional render_snapshot→RenderSnapshot,crawl→Crawl; evidence through provenance | Raw; URL/query redaction applies |
| BusinessTwin | business→Business; assertions→TwinAssertion; prior→BusinessTwin; one current revision per business/site | Derived; every published revision retained until expiry |
| TwinAssertion | business→Business; observations→Observation; field enum includes offering/location/archetype | Derived, bitemporal; contradictory values coexist |
| Entity | site-local graph identity; external_key optional opaque identifier, never authorization | Derived; merge state preserves aliases, no physical merge in first slice |
| EntityAssertion | subject/object→Entity; exactly one of object_id/literal non-null; evidence_bundle→EvidenceBundle | Derived, bitemporal |
| Relationship | subject/object→Entity,assertion→EntityAssertion with matching triple; outgoing/incoming indexes | Derived; current graph is a projection of assertions |
| Query | entity→Entity of query type; text+language contextual; origin observed/inferred, no implicit volume | Derived; unique tenant+entity |
| Topic | entity→Entity of topic type; ontology_version fixed per assessment | Derived |
| Intent | entity→Entity of intent type; mixed/unknown valid | Derived |
| Location | entity→Entity of location type; confirmed=false for public inference; mentions not premises | Derived |
| Competitor | entity→Entity of competitor type; contextual evidence mandatory to assert competition | Derived; no instances without observed context in first slice |
| Observation | subject→record_index, evidence→Evidence, attempt→job attempt ledger; context hash mandatory | Raw; retry observations are distinct, accepted dedupe by attempt+subject |
| Evidence | immutable artifact_key/digest/size/MIME; locator points into artifact; available requires stored matching blob | Raw; expire blob and redact metadata per 34 |
| EvidenceBundle | evidence/observations/assertions pinned by IDs; known_at cutoff; frozen manifest hash | Derived; never substitute newer evidence during retrieval |
| Belief | assertion→TwinAssertion or EntityAssertion; bundle→EvidenceBundle; fresh_until independent of historical validity | Derived, bitemporal |
| Hypothesis | bundle→EvidenceBundle; alternatives→Hypothesis; test string describes distinguishable observation | Derived, bitemporal; no auto transition into fact |
| Capability | global unique capability_id+contract_version; definition hash pins 14/15 or compiled contract | Registry, append release versions |
| Skill | global unique skill_id; approved release is separate | Registry |
| SkillRelease | skill_id→Skill by natural ID; unique skill_id+semver; manifest hash immutable, lifecycle journal separate | Registry; never overwrite released bytes |
| Sensor | global sensor_id+version with contract hash; public/connected distinct | Registry |
| Connector | unique tenant+site+provider; credential_ref opaque or null; not_connected requires null credentials | Identity; revoke credential immediately; historic coverage retained |
| ConnectorCoverage | connector→Connector; unknown must include missingness; no source metrics inferred | Derived, bitemporal |
| AgentMission | crawl→Crawl,bundle→EvidenceBundle; immutable mission manifest, mutable status; deadline ≤ crawl deadline | Operations |
| Strategy | business→Business; current_revision→StrategyRevision; one site portfolio | Derived; compare-and-set current pointer |
| StrategyRevision | strategy→Strategy,bundle→EvidenceBundle,opportunities→Opportunity; unique current accepted series revision | Derived, bitemporal; no competing priorities |
| Opportunity | target→record_index; business_assertions→TwinAssertion; bundle→EvidenceBundle; priority 1–3, benefit unknown | Derived, bitemporal; recommendation only |
| Territory | offering→Entity of offering type; evidence_bundle→EvidenceBundle | Derived, always unknown without real visibility evidence |
| ActionProposal | opportunity→Opportunity; authority none; state non_executable | Future compatibility only; no table required at milestone 1 |
| Approval | proposal→ActionProposal; disabled and authority none | Future compatibility only; no approval API |
| Experiment | hypothesis→Hypothesis; design only; exposures empty | Future compatibility only; no intervention |
| Evaluation | target→record_index; bundle→EvidenceBundle; gate IDs reference 35 | Derived; completed evaluator output, not mutator self-grading |
| Measurement | finite numeric value, metric/unit/grain contract 35; numerator/denominator both set or both null | Derived, temporal; no ranking/revenue metrics in first slice |
| Outcome | evaluation→Evaluation,measurements→Measurement; causal status not_established | Derived, temporal |
| AuditEvent | actor authenticated service/User; target→record_index; operation/detail enumerated by caller contract | Audit; no raw payload or secret values |
| SelfAuditResult | crawl→Crawl, evidence→Evidence; check_id/version from 35; effect prescribed by check | Audit; immutable receipt |

## Additional necessary physical records

`job` uses job.schema.json plus lease owner/timestamps from 33; `job_attempt(job_id,attempt_no,attempt_id,start,end,input_hash,result_ref,cost)` unique job+attempt. `outbox` stores validated event bytes with dispatched_at/attempt_count. `inbox(tenant_id,consumer,event_id)` unique triple. `budget_reservation(tenant_id,crawl_id,reservation_id,kind,amount,state)` prevents concurrent overspend. `publication(tenant_id,site_id,watermark,bundle_id,graph_digest,cards_digest,audit_ids,published_at)` is the atomic visible cutoff; previous publications persist.

`entity_binding(tenant_id,site_id,entity_id,native_type,native_id)` maps graph identities to Business/Page/TwinAssertion etc.; unique site+native_type+native_id. Entity IDs are distinct from native record IDs. An offering inferred from a TwinAssertion is a separate Entity bound to that assertion; it is not a confirmed catalog item.

`deletion_ledger(tenant_id,scope_type,scope_id,epoch,requested_at,state,completed_at)` is kept outside ordinary backup rollback (34). `release_state(skill_id,semver,generation,status,effective_at,reason)` is append-only and independent of manifest bytes. `session` stores a hashed opaque session token, User, selected Tenant, created/expiry/revocation times; 34 defines authentication. These are required implementation records, not optional infrastructure inventions.

## Transaction and index obligations

Observation acceptance inserts blob reference, observation, relevant snapshot and outbox event in one SQL transaction after blob upload; rollback leaves an orphan blob for collection. Derived publication pins a frozen bundle, assertions, evaluations and projection watermark atomically. Compound tenant FKs, RLS and application checks are complementary, not substitutes.

Add unique current revision indexes on `(tenant_id,series_id)` WHERE superseded_at IS NULL for a single belief series; competing claims use distinct series. Add B-tree recorded_at/valid_from indexes and site/predicate/source+target indexes; no vector index or graph store now. All temporal joins constrain known_at as well as valid time. Run DB statement timeout 5 seconds for API reads and 30 seconds for bounded batch writes, with page sizes ≤200. Migrations use dedicated owner role, never the runtime role.

## Closure amendments

Tenant records additionally require knowledge_seq; temporal revisions require superseded_seq; EvidenceBundle adds known_seq (26). The catalog marks Evidence, Observation, EvidenceBundle, ResourceObservation, SkillRelease, Evaluation, AuditEvent and SelfAuditResult immutable. ResourceObservation can record a denied method; this never permits dispatch. RenderSnapshot evidence_id may be null only when no capture exists.

CapabilityAssessment (site, immutable, derived) stores capability/release, bundle, result, assertions, support, missingness and freshness; index tenant/site/capability/recorded_at. DecisionRecord (site, immutable, derived) pins bundle, optional Twin/strategy revisions, skill/model results, alternatives, policy and rationale; index tenant/site/recorded_at. Both use schema/catalog required fields and same-scope references. These complete the first pipeline rather than introducing generic record blobs.

M1 materializes only its named subset. Pure tenant identity/access audit events use a separate access audit table because site-scoped AuditEvent cannot truthfully reference a nonexistent Site. Evidence immutable payloads are not exposed to generic UPDATE; expiry/redaction metadata requires restricted maintenance commands and audit.
