# 24 — Resolved and Deferred Decision Register

Status: Phase 3 engineering defaults decided under the user's explicit instruction to resolve reversible choices. These decisions authorize a design, not application scaffolding or production processing. Baseline: `a6d2a3f0f02574866c47d0c15682024217f62c5c`. AGENTS, README and 00–23 were reread in order.

Classes: **E** ENGINEERING DEFAULT; **P** PRODUCT DECISION; **S** SECURITY/PRIVACY DECISION; **W** DEFERRED WRITE-PHASE DECISION; **V** EXPERIMENTALLY VALIDATED LATER. A decision can be technically resolved while its implementation test remains unperformed. “Later” is never permission for a coder to invent behavior.

## Earlier risk register closure

| 07 ID | Class | Resolution / implementation contract |
| --- | --- | --- |
| R01 | P, resolved by explicit Phase 2/3 instructions | Claim-specific authority and no universal truth score; 26. Official prohibitions still constrain all tactics |
| R02 | S, resolved read-only | Tenant access is separate from public Site discovery and control proof; 25/34. No write grant exists |
| R03 | E, resolved | One accepted strategy revision per site, expected-version compare-and-set; 33 |
| R04 | E, resolved | Distinct collection/job/publication states; action types are disabled compatibility records; 25/33 |
| R05 | W, deferred | No external side effects beyond observation; write receipts/rollback protocols not implemented |
| R06 | S, resolved restrictive default | No global learning, private data sharing or training permission; 34 |
| R07 | E, resolved | Immutable manifests, source pins, separate release-state journal, execution/publication checks; 28 |
| R08 | V, gates fixed now | Categorical support; exact first-slice quality thresholds in 35. Numerical calibration/Auto later |
| R09 | W/V, deferred intervention | Only fixture evaluation and observational results; no causal SEO experiment in first slice |
| R10 | E, resolved | PostgreSQL typed assertions, bitemporal versions, bounded graph; 25–27 |
| R11 | E, resolved | Provisional field-level Twin; extraction versus business confirmation separate; 26/31 |
| R12 | E, resolved boundary | Connected adapters disabled with explicit missingness; 29. Their actual APIs are separate later work |
| R13 | E/V, default fixed | Concrete budgets, fairness, durable queue and load acceptance; 30/33/37 |
| R14 | S, resolved | Deterministic capability enforcement outside model/renderer workers; 32/34 |
| R15 | P/V, scoped | First-slice measures correctness/coverage, no observed rank or sales. Commercial outcome metrics deferred, not invented |
| R16 | S, design resolved; launch approval separate | Exact development lifecycle, restrictive deployment profile, deletion/restore protocol; 34 |
| R17 | E, resolved | Modular core, separate hostile render workers, nine read-only manifests; no specialist microservice catalogue |

## Earlier decisions and specification backlog

| 13 ID | Class / disposition | Binding answer |
| --- | --- | --- |
| D01 | P/E resolved | Preserve constitution plus explicit claim-type clarification from current instructions; 26 |
| D02 | S/E resolved | Tenant is isolation boundary, Business is optional until inferred, Site URL is tenant-local; owner/editor/viewer/expert roles; 34 |
| D03 | E fixture default; P commercial choice later | Local-service English fixture first, behavior coverage for commerce/SPA/publisher/hybrid; no permanent market exclusion |
| D04 | W deferred | No execution adapter or website mutation routes |
| D05 | W deferred | No approval/Auto actions; future expert/owner authority not implied |
| D06 | S resolved fail-closed implementation | Local synthetic profile usable; deployment requires explicit region/retention/provider policy record. Proposed pilot values in 34 are not customer commitments |
| D07 | E defaults + V performance proof | 30 budgets; 100 tenants/200 sites development load envelope; 37 recovery targets |
| D08 | E decided | Node 24/TypeScript/Fastify/PostgreSQL 17/SQL jobs/S3 interface/Playwright sandbox; ADRs in decisions |
| D09 | E first-slice metrics; P/V commercial later | Precision/recall/evidence/coverage/latency/cost only, fixed gates 35 |
| D10 | E design fixed; operational roles at release | Release authority is reviewed registry import by operator; skill author cannot self-approve; source pins/examples 28 |
| D11 | E disabled now, V connector verification later | PUBLIC sensors only; connected sources return unknown. No Bing/Google API guessed |
| D12 | W/V/S deferred | Auto, shared learning and causal experimentation disabled |

| 13 specification ID / 23 gap | Closure in Phase 3 |
| --- | --- |
| S01 ADR register | This register plus ADR-001–006 and 37 |
| S02 physical domain/access | 25 + domain.schema.json + storage.catalog.json |
| S03 threat/permissions | 34 + explicit failure fixtures in 36 |
| S04 evidence/event schemas | 26/33 + evidence/event/job/common schemas |
| S05 sensor/connector | 29/30 + sensor/tool schema + discovery policy |
| S06 skill/tool releases | 28 + skill schema, source pins and nine example manifests |
| S07 workflow/action | 33 read-only jobs; action portion intentionally W deferred |
| S08 metrics/evaluation | 35/36 + acceptance fixture manifest; causal portion deferred |
| S09 capacity/recovery | 34/37; executable drills are implementation acceptance, not more architecture |
| S10 client/graph APIs | 27/37 + API/graph schemas; future approval UI omitted |

The eight blockers in 23 section 3 map to these rows: access→S02/S03; evidence→S04; public sensors→S05; skills→S06; lifecycle→D06; runtime→D07/D08; client→S10; evaluation→S08. The nine tensions in 23 section 2 are resolved by R01/R02/R06/R10/R11/R17 and the explicit read-only boundary; generated-site authorship remains unclaimed and 3D remains optional.

## Implementation versus deployment

An engineer may implement the contracts with synthetic fixtures and local test identities without a new privacy decision. A real deployment must have an approved deployment profile before accepting public customer URLs or calling an external model. Missing approval yields `policy_blocked`, not a permissive default. Choosing that restriction resolves behavior; it does not pretend the owner approved an actual provider/region. Only material changes to that authority/privacy boundary require escalation. No further generic specification phase is recommended.
