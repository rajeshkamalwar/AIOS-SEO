# 29 — Sensor Connector Contract

Status: first-slice sensor envelope in [sensor.schema.json](../spec/sensor.schema.json); operational limits in [discovery-policy.json](../spec/discovery-policy.json).

Public sensors: http, html, robots, sitemap, browser_render, public_assets. Connected sensors: gsc, analytics, bing; future names require a versioned schema extension. Public envelopes have connector_id=null and only public-discovery permission. Connected envelopes require a same-site Connector. Missing connection returns class=connected, health=unknown, sampling=not_collected, missingness.reason=not_connected, empty observations/metrics/permissions, unknown coverage, null windows. No remote request or retry is scheduled for missing credentials. The retry envelope's attempt=1 denotes first envelope evaluation, not a fabricated provider call; cost=0.

Collection receipts contain requested URL scope, collector version, collection instant, source window, freshness deadline, sampling, explicit counts, missingness/error and cost. `requested = observed + failed + excluded + deferred` at a terminal checkpoint. An observed response can contain a technical finding; HTTP404 is observed, transport timeout is failed. In-progress counts report unfinished items as deferred with reason=in_progress. Unknown_population describes an unknown whole-site denominator; it never justifies a sitewide percentage.

A collector version pins parser and policy digests in its context artifact. One attempt and subject produce at most one accepted Observation; a deliberate repeat has a new attempt ID. Partial streams retain captured bytes, failure reason and truncation; absence claims require complete relevant input. Observation windows are null for instantaneous public requests; provider periods are never substituted with collection time.

Failed transport may retry under 33; invalid schema, scope denial, disconnected provider and robots denial do not retry. Sampling uses declared template roles and lowest normalized URL tie-break; sample claims remain sampled. Reuse requires same tenant/site, matching request context and freshness. Public pages fetched for different tenants do not share private caches.

Connected implementation is deferred: real provider auth/scopes, property mapping, pagination, finality, quota, licensed usage and correction fixtures are required per connector before activation. No placeholder active connector, invented API method or assumed Google/Bing parity is permitted. Disconnection revokes calls immediately and retains historical evidence subject to 34.
