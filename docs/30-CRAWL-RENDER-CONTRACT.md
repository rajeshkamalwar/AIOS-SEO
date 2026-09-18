# 30 — Crawl Render Contract

Status: binding first collection policy; budgets are machine-readable in [discovery-policy.json](../spec/discovery-policy.json). Values are engineering bounds, not search-engine rules.

## Admission and identity

url-v1 uses WHATWG URL parsing, HTTP/S only, host lowercase/IDNA serialization, default-port elision, empty path→/, fragment removed from fetch identity but original retained. Preserve path case, trailing slash, encoded slash and query order/duplicates. Reject userinfo, control characters, backslashes, IP literals, nondefault ports, localhost/single-label/local suffixes and credential-like query keys (token, key, secret, password, auth, signature, session and known access/refresh/ID-token, API-key, client-secret, authorization and signed-URL credential/signature aliases, including array-key variants). Do not sort or strip ordinary parameters. A SHA-256 lookup accelerator may index a URL, but equality also compares full normalized string; hash collision is not identity.

Site identity is tenant+submitted normalized origin. Fetch scope initially that origin. Same-host HTTP→HTTPS redirect may add the HTTPS origin under explicit policy; record alias without merging existing Site records. Different host/subdomain/port is excluded, even if a canonical names it. A later explicit submission can observe that site independently.

Egress resolves all A/AAAA/CNAME results with bounded depth and rejects any non-global destination, mapped IPv4 private range, loopback, link-local, multicast, reserved/metadata address. Pin a validated IP to the connection, preserve host/SNI/certificate verification, disable proxy-environment bypass and revalidate on every new connection and redirect. Never validate DNS then let the client resolve it again. Public DNS is not sufficient authorization. Network firewall/proxy independently denies internal destinations.

Exclude action-like paths/parameters (logout, delete, remove, unsubscribe, checkout, cart/add, wp-admin, admin, login, account and explicit action= values) with recorded policy reason. This is conservative, incomplete knowledge of server semantics; observational GET may still create access logs. No cookies, credentials, user interaction or challenge bypass.

## Robots, sitemap and frontier

Fetch /robots.txt first through the same egress/budget rules. Follow at most five allowed redirects. Successful parse uses RFC9309 agent/group/path matching including longest match and Allow on equal specificity. Empty Disallow is unrestricted. 404/410 means no available rules. 401/403 means denied. 429/5xx, timeout, oversize and unparsable bytes mean unknown and stop new page admission; this is stricter AIOS policy. Cache at most24h per origin+agent+policy; recheck on new run if stale. A robots fetch is the only bootstrap exception to requiring a robots decision for that origin.

Use allowed same-origin Sitemap declarations then /sitemap.xml. XML entity/DTD expansion and external retrieval disabled. XML/text formats accepted, ≤20 sitemap documents, index depth≤2, decompressed5MiB/document, 5000 discovered URLs overall; gzip obeys decoded caps. No sitemap is not a defect. lastmod is a declaration, not verified freshness. Out-of-scope members are counted/excluded without fetch.

Retain each accepted sitemap document and its exact source evidence, parent index and depth separately from page targets. Root documents have depth0; child documents may reach depth2. Deeper index children remain explicitly deferred. Index members never become page targets merely by appearing in an index. One accepted document per source URL per run prevents cycles and evidence substitution; exact historical batch retries remain idempotent under current gates. All ancestor source receipts must remain verified and pinned in the consuming frozen bundle.

Frontier unique by crawl+url-v1 key. Priority: submitted seed, home/about/contact/service candidates, sitemap URLs, other links; within tier depth then normalized URL. Maximum500 admitted, depth6 for link paths; sitemap seeds depth0 with source provenance. Exclude further URL expansion after20 distinct query variants for one pathname per run; report sampling, never assert variants are duplicates. Content hashes suppress repeated expensive analysis under matching context, not URL identities or observations. Canonicals are observations only.

GET document collection accepts text/html, application/xhtml+xml, XML sitemap MIME or bounded text/plain sitemap/robots. Unsupported/binary MIME yields headers-only observation and explicit extraction not_applicable. No PDF/video body extraction in v1. Charset: declared supported encoding via deterministic decoder, otherwise HTML encoding sniff; undecodable content is parse_failed. Header limit32KiB, decoded response5MiB, total HTTP decoded250MiB. Retain bounded failure receipt when no body exists.

Limits:750 HTTP attempts including every hop/robots/sitemap/retry; two in flight per origin across runs, ≥1s between starts, global fairness in33. DNS3s, connect5s, headers10s, request20s, run1200s. Retry at most twice for timeout/429/502/503/504 or connection interruption; respect Retry-After within run deadline, otherwise defer. Never bypass rate limiting by switching worker or origin alias.

## Rendering

Trigger only after raw observation: first representative page per observed role/template, then suspected essential-content/metadata mismatch; max20 navigations including repeats, one per run at a time. Fixed viewport390×844, en-US, Chromium/build pinned. Isolated Linux nonroot browser sandbox and constrained egress; no production secrets or DB credentials inside. Browser contexts alone are not an OS security boundary.

GET/HEAD only; block forms/clicks, POST data requests, beacons, sockets, downloads, popups, service workers and persistence. Third-party static resources need public destination checks and robots eligibility; their robots requests consume the HTTP lane. Failed robots eligibility blocks that resource and marks render policy-limited. No robots recursive requirement for the robots fetch itself. Third-party origins do not enter frontier.

Capture DOM at DOMContentLoaded and +2/+5s, bounded by20s navigation time,100 requests and10MiB/page, 2000 requests/200MiB/run. All denied method attempts may be recorded by ResourceObservation, but are not dispatched. Count attempted requests conservatively. Proxy caps decoded and transferred bytes; no unlimited resource body downloads.

Sample timestamps must be measured by the worker outside page JavaScript, with trusted invocation bounds checked at receipt validation. Record outstanding HTTP requests from request lifecycle events; pending counts do not establish rendering completeness. Each denied resource attempt retains its own measured observation time. Missing measurements must not be synthesized.

Store raw HTML and each captured DOM independently with matching navigation context. Failure before DOM produces null evidence_id, a failure receipt and no invented snapshot. Compare title, canonical, robots, visible main text and resolved anchors using parser locators. Critical content disappearing across samples is a qualified observation; harmless enhancement/analytics error alone is not a defect. Repeat a mismatch within remaining sample budget before recommending repair; otherwise provisional. Dynamic content still changing or blocked POST yields incomplete/policy_limited, not proven website failure.

**Browser render != Google render != indexed state.** Framework names, rendering modes and exact versions remain hypotheses unless directly established. Partial crawl completes only its declared admitted scope; pending/excluded/failed sets stay visible. Worker crashes resume committed frontier, never reset budgets.
