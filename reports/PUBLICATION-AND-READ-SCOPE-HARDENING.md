# Publication suppression and exact-site run access

Baseline: cd4a9d3. Local synthetic execution only.

## Findings and correction scope

GAP-030: legacy publication JSON had no independently verifiable evaluator, source, run or release linkage. Runtime/operator INSERT allowed ungoverned claims. Under canonical35 and ADR-007, absent gates and unverifiable dependency scope cannot publish. ADR-013 records the reversible interim: revoke all service-role publication mutations, retain historical rows, authorize exact site and independent deletion, query existence only, and suppress any legacy projection. No projection is 503 projection_pending; an unverifiable one is503 policy_blocked. There is no local bypass. Independent governed publication remains an OPEN capability gap.

GAP-031: run reads called authorize with a null site, incorrectly denying site-limited memberships. Resolve the run under transaction-local tenant RLS, authorize its actual site before serializing data, and check independent deletion. Cancellation still requires the Jobs write gate. No caller-supplied site or tenant can widen authority.

## Verification

Before correction: six scope regressions failed; publication tests demonstrated runtime/operator INSERT success, well-shaped legacy disclosure and malformed legacy handling that exposed the wrong failure category. After correction: **383 main-process tests (including12 nested SQL-role cases) +6 separate scope cases =389 application tests**, zero failures/skips. Compiled API/perception/understanding:45 passed. Typecheck/build and specification validation pass (21 schemas,1035 references,122 document links). Root and render-worker production audits report zero vulnerabilities. The unchanged Docker worker was not rerun.

Independent review checked the suppression interpretation and actual-site authorization. GAP-031 and the scoped exposure GAP-032 satisfy their local closure criteria. GAP-030/GAP-015 stay open: there is no independently governed successful publication writer, and no live-site or production proof.
