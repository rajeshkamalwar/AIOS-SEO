# 27 — Knowledge Graph Contract

Status: binding bounded projection contract. [graph.schema.json](../spec/graph.schema.json) is the response shape. Canonical truth is typed relational assertions; no separate graph database is needed for radius-two neighborhoods.

Entity UUIDs are tenant/site-local. Business/Page native IDs map through entity_binding; a name, URL canonical or embedding match never merges entities. Initial types: business, page, offering, audience, query, topic, intent, location, competitor. Competitor/query visibility cannot be invented from public content. Merge/split execution is deferred; identity ambiguity stays provisional.

| Predicate | Subject → object | Required support |
| --- | --- | --- |
| business_offers | business → offering | Offering statement locator; inferred until confirmed |
| serves_location | business/offering → location | Explicit service statement; address mention alone insufficient |
| page_describes_offering | page → offering | Page passage plus offering assertion |
| page_mentions_entity | page → any allowed entity | Exact mention, disambiguation status |
| page_links_to | page → page | Resolved href and original link locator |
| declares_canonical | page → page | Observed HTML/header declaration, not engine adoption |

EntityAssertion subject/predicate/object must match its Relationship projection. Exactly one object_id/literal is non-null; only entity-object assertions become edges. A literal supports field-level meaning but never creates a fake node. Evidence links are navigable through assertions; 19's observed_at/finding_targets/opportunity_addresses are provenance drill-down relationships, not additional semantic edge types in v1. This explicit narrowing keeps real lineage without misusing graph identity.

Queries authorize before traversal and counts. Radius 0–2, ≤200 nodes, ≤400 edges, five-second query timeout, stable sort by hop/predicate/UUID. No edge without visible endpoints. Reachability is relative to observed graph, not full-site crawl depth. Cycles are valid; visited sets bound work. Duplicate locators may support one assertion; preserve all provenance without duplicate semantic edges.

Pin publication watermark and known_seq; use 26 for historical filtering. Cursor is authenticated opaque state binding tenant, principal scope, site, root, filters, time, watermark and last key; expires after 15 minutes. Scope revocation invalidates immediately. Changed/expired watermark returns conflict, not mixed results. `truncated=true` denotes actual omitted results; no inferred total of unseen nodes. Root outside scope returns indistinguishable 404. Projection absent returns projection_pending, not empty success.

Client view returns business labels, evidence refs, basis/support and uncertainty; expert view resolves permitted artifact locators, check versions and raw diagnostics separately. Neither returns secrets, arbitrary stored HTML or other-tenant identifiers. Escape labels as text. Sanitized evidence drill-down is authorized at read time. Client and expert views describe the same snapshot.

Future motion consumes accepted events and persisted changes. Replaying a projection never runs agents or creates progress events. Accessible list/2D representations expose the same nodes and evidence; no 3D UI in the first implementation milestone.
