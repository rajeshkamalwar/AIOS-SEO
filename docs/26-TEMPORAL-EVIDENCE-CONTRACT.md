# 26 — Temporal Evidence Contract

Status: binding first-slice engineering contract. Completes 09/10; schema fields are in [domain.schema.json](../spec/domain.schema.json).

## Time and concurrent acceptance

`observed_at` is the collector's observation instant, not the time a page was published. `valid_from/to` describe a half-open world interval; null means unknown, not proof of validity for all history. Date-only source periods preserve their timezone/grain. `recorded_at` is acceptance time assigned by the database. `superseded_at` marks when a revision was replaced in knowledge, not when the world changed. `fresh_until` is an eligibility deadline, never a truth guarantee.

A timestamp alone cannot define a historical snapshot: a long transaction can commit later with an earlier transaction timestamp. Each tenant therefore has a `knowledge_clock(tenant_id,seq,recorded_at)`. All domain acceptance transactions lock it, increment seq, and retain the lock through commit. Assign acceptance time as max(clock_timestamp(), previous recorded_at); no network or model call under this lock. Rows/events receive `knowledge_seq`. A cutoff is `(known_at,known_seq)` captured after acquiring the same lock. Sequence is authoritative under clock ties or regression. API numeric sequences are capped at JavaScript's safe integer limit; exhaustion halts writes rather than rounding.

Historical selection: knowledge_seq ≤ K and (superseded_seq is null or superseded_seq > K). Apply valid-time predicates separately. Unknown valid bounds return an explicitly uncertain interval, not an unqualified historical fact. Cutoff creation and bundle membership validation occur under one transaction. A later correction cannot be inserted below an already issued cutoff. There is no cross-tenant global ordering.

Revision replacement locks the series and tenant clock, checks expected version, sets the prior superseded_seq/time and inserts a fresh UUID with version+1. Original value, observations and acceptance time never change. Contradictory claims occupy separate series and coexist. A decision's frozen bundle pins IDs and hashes; current retrieval never substitutes new revisions. Mutable identity labels must not be used to reconstruct old narratives: use the frozen publication snapshot and assertion values.

## Machine meanings

| Type | Stored representation and rule |
| --- | --- |
| OBSERVATION | Observation plus artifact/context: report of collection, including partial/failure |
| ASSERTION | TwinAssertion or EntityAssertion with basis and evidence; not automatically supported |
| FACT | Validator-confirmed narrow observation assertion; basis=observed and support.inference=deterministic. A server statement is a fact about its text, not verified business reality |
| BELIEF | Belief revision assessing an assertion at a pinned cutoff |
| HYPOTHESIS | Hypothesis with alternatives and a discriminating test; never auto-promoted by model confidence |
| RECOMMENDATION | Opportunity; benefit unknown, no execution receipt |
| ACTION | Future ActionProposal remains non_executable; observation execution uses job/tool receipts |
| OUTCOME | Outcome references measurements/evaluation, causal_status=not_established |

`unknown` means no adequate conclusion; `not_observed` names absent collection; `not_connected` names absent access; `not_applicable` requires an exclusion predicate; `contradicted` records opposing evidence; `stale` means unusable for a current assessment. None means numeric zero. A supported observation may coexist with an uncertain interpretation.

## Sufficiency, artifacts and lineage

Before publishing: all references resolve in the same authorized tenant/site, input seq ≤ cutoff, hashes match, locators resolve, source class applies, coverage meets the skill requirement, and freshness/contradiction rules pass. The support vector keeps applicability, integrity, coverage, identity and inference separate. No arithmetic mean or LLM probability can override any failed gate.

Artifact digest is SHA-256 of stored bytes after the declared redaction transformation; a redacted artifact is a new evidence ID with lineage to its original when retention permits. Never present its digest as the raw response digest. Locator grammar: `bytes:<start>:<end>` uses zero-based half-open byte offsets; `json:<RFC6901 pointer>` applies to stored JSON. HTML parsers emit byte locators into original bytes plus parser version, not mutable DOM selectors alone. Metadata-only failure evidence uses JSON error receipts, not fabricated HTML.

Manifest hashes use UTF-8 JSON with recursively sorted object keys, compact separators, no NaN/Infinity, no floats in manifests, preserved array order and no Unicode normalization. Hash the declared manifest fields excluding manifest_hash itself. Persist serialized hash input alongside digest. Blob upload precedes DB acceptance; unreferenced objects are not evidence. Partial bytes retain truncation status and cannot substantiate absence outside the captured range.

Live page evidence expires for new conclusions after 24h; inferred context after 30 days; rule freshness follows 28. Freshness is the minimum of dependencies, also invalidated by correction/revocation. Retention is separate (34). Expired/deleted artifacts return unavailable with permitted metadata; a past decision remains identifiable but can no longer claim full artifact reconstruction.

## Boundary trace

At K=10 a page says Nagpur. At K=11 a belief provisionally associates the business with Nagpur. At K=12 a correction, valid since before K=10, says Wardha. A K=11 bundle still contains Nagpur; a current query preserves both assertions and selects the new assessment with its contradiction. Two workers replacing the same belief version yield one success and one conflict. Deleting the original artifact later changes access availability, never rewrites the historical claim to Wardha.
