# 20 — Client Interpretation Model

Status: proposed projection and acceptance contract. **Backend speaks SEO. Frontend speaks business.** The interpretation layer changes vocabulary and detail, never epistemic status, authority or numbers. Parent: 06, 09, 12; capability owners: CAP-UX-01–04.

## 1. Projection schema

A `BusinessCard` requires ID, tenant/site, source assessment/decision IDs, projection version, input watermark, generated-at, last-observed-at, claim kind, scope, materiality, headline, business meaning, known facts, uncertainty/missingness, proposed next step, action status and evidence drill-down. `business_impact` is tagged `observed`, `attributed`, `estimated`, or `unknown`, with compatible metric definitions and source windows. Estimated values require a method and uncertainty; no value is a valid result.

`action_status` is one of `observation_only`, `recommendation`, `awaiting_approval`, `executing`, `applied_unverified`, `verified`, `monitoring`, `outcome_unknown`, `compensated`. Values must come from domain state; an interpreter cannot advance the lifecycle. The first slice permits only observation/recommendation statuses. No approval button exists when there is no executable proposal and authority contract.

An `ExpertFinding` adds capability/skill/source versions, artifact locators, exact URLs, parsed values, detection/diagnosis, counterexamples, source coverage, risk/blast-radius assessment and independent validation result. The two views share a finding ID and input cutoff. Corrections supersede both. A client can reach the technical evidence without being forced to understand it before receiving value.

## 2. Representative paired interpretations

These are fictional examples, not observations of a real website. Conditions are part of the contract; text is only valid when its evidence exists.

| Capability / evidence condition | Expert interpretation | Client interpretation |
| --- | --- | --- |
| CAP-URL-02: contemporaneous conflicting declared signals | Sitemap member and canonical/redirect target disagree; engine-selected canonical unavailable | “Your site gives conflicting signals about which version of this page should represent the business. We need to confirm the intended page.” |
| CAP-ROB-02: observed noindex on relevant page | Page contains applicable noindex; provider state not connected | “This page asks search engines to leave it out of results. We should confirm whether that is intentional.” |
| CAP-ROB-01: AIOS agent blocked | Crawl policy disallows our collector; page content unobserved | “The site currently prevents our collector from checking this page. Its content and search status remain unknown.” |
| CAP-JS-02: repeated missing essential rendered content | Main service text disappears under tested render conditions | “The service information disappeared in our browser checks. We recommend checking how the page loads.” |
| CAP-JS-06: blocked analytics only | Optional analytics resource failed; main content stable | “The page content loaded in our check.” Do not surface an alarming content-loss card |
| CAP-JS-08: placeholder phone/link observed | Generated-looking template has a nonfunctional contact placeholder; authorship unknown | “A contact link appears unfinished, which may prevent visitors reaching you.” |
| CAP-IA-05: incomplete graph and independent inventory | No inbound link observed for an inventory page; crawl partial | “We have not found a route to this page in the part of the site checked so far.” |
| CAP-COM-05: confirmed temporary stock absence | Out-of-stock product remains useful; removal not justified | “This product is temporarily unavailable. Keeping useful product information may still help customers; removal needs a separate review.” |
| CAP-SD-04: matched offer disagreement | Visible price and structured offer disagree for same variant/time | “This product shows different prices to visitors and automated readers. We should align them with the correct price.” |
| CAP-SD-05: validation passed | Markup valid for tested rules; appearance unobserved | “The product information passed the checks we ran. Search engines still decide how to display it.” |
| CAP-PERF-02: repeated lab LCP delay | Largest visible element slow under declared lab device/network | “The main content loaded slowly in our test conditions. We need real-visitor data to know how widely this affects customers.” |
| CAP-LOC-03: verified hours conflict | Website and observed listing publish different hours | “Your opening hours differ across the places checked, which could confuse customers.” |
| CAP-INT-02: alternate-page mismatch | One observed language alternate points to a different offering | “People choosing this language may reach the wrong offering. We recommend reviewing the link between versions.” |
| CAP-AUTH-05: provider omits link, source unavailable | Lost-link candidate unverified | “A previously reported reference could not be confirmed. We have not established that it was removed.” |
| CAP-AI-03: repeated panel observations | Site cited in a stated subset of sampled answers | “Your site was cited in some of the answers we sampled. This does not describe all AI searches.” |
| CAP-ANA-02: valid attribution source | Source attributes enquiries under named model/window | “The connected report attributes these enquiries to organic search under its reporting rules.” |
| CAP-EXP-03: confounded ranking rise | Movement follows edit but concurrent changes invalidate causal conclusion | “Visibility rose during this period, but we cannot tell how much the change contributed.” |
| CAP-AUDIT-02: revoked dependent skill | Assessment suspended pending re-evaluation | “We are rechecking this recommendation because the guidance behind it changed.” |

Avoid implying receipt by Google when only site declarations were observed. This deliberately tightens the user's illustrative “Google is receiving…” wording: the system knows what the site serves, but may not know what an engine has fetched.

## 3. Mobile-first delivery rules

Home answers current understanding, meaningful progress, risk and decisions. Brain shows the actual graph with progressive disclosure. Inbox includes only meaningful material changes, not every completed fetch. You holds business constraints, connections and preferences. Customer web uses these same semantics; Expert Console adds diagnostic depth under roles.

A first-run summary contains what was understood, what was checked, up to three material next steps, and what remains unknown. It does not display zero traffic/rank/revenue cards as placeholders. A successful read-only run can honestly say “We checked 80 pages and identified a question about your service area,” not “SEO improved.” Unavailable data stays distinguishable from a healthy finding-free site.

Cluster graph nodes by real domain types/relationships. Every semantic edge resolves to an assertion and evidence; inferred edges use a distinct style plus accessible text. Count observed entities, disclose truncation and watermarks, and avoid particles that suggest work without a corresponding event. Offer a list/table view, reduced motion, keyboard/screen-reader navigation and sensible small-screen expansion. 3D is optional and replaceable; it must earn its usability advantage over 2D.

Cached views show their age. A reconnect refreshes current state before any later approval; offline taps cannot create authority. Notification text contains minimal information and links to authenticated current state. Never reveal tenant facts in push payloads or a shared device preview by default.

## 4. Materiality and notification contract

`InterpretationEvent` includes incident key, affected business scope, severity, evidence confidence, first/last observation, changed fields, required response and deduplication key. Materiality uses business relevance and actionable consequence, not the number of SEO warnings. Coalesce repeated observations of one incident; retain all underlying evidence. Missing source access creates one coverage notice, not a failure card for every dependent capability.

Critical integrity issues must reach the authorized operator/customer route even if routine summaries are muted. Low-confidence potential harms are labeled for investigation, not dramatized. Resolution requires new validating evidence, not an elapsed timer. A projection-only refresh does not send a new notification. Notification preferences and authorized channels are a product contract before production; no messages are sent by this documentation phase.

## 5. Interpretation verification

Before publication, validate scope, lifecycle state, numbers/units/time windows, evidence entailment, uncertainty preservation and forbidden claims. A model-generated summary that fails uses a deterministic fallback based on the structured result. Do not let a fluent paraphrase override the validator.

Acceptance pairs must test: fact versus hypothesis; zero versus unavailable; sampled versus complete; deployed versus verified; attributed versus caused; noindex versus confirmed deindexing; valid schema versus rich appearance; graph projection lag versus changed knowledge. Client comprehension tests should ask users what is known, what is uncertain and what happens next. Expert users must reconstruct the exact statement from the same evidence. No comprehension score or evaluated UI is claimed in Phase 2.
