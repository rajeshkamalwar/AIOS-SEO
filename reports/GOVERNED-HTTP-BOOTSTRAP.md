# Governed local HTTP bootstrap

Baseline:42d88b3. Scope: [ADR-022](../docs/decisions/022-governed-local-http-bootstrap.md).

Dedicated scope-derived fetch child, exact installed Skill permission, current admission/start/socket checks and cumulative one-call accounting implemented. Independent review found omitted frozen-bundle manifest authentication; corrected before verification and regression-covered.

Verification: `npm test` passed547 application tests (541 primary plus6 API scope) and10 separate vault guards. Compiled bootstrap48 plus61 independent compiled tests passed (109 total). Opt-in Docker suite38 passed:36 protocol overlaps and2 actual container cases, including governed one-hop execution and hostile isolation probes. Typecheck/build passed. Specification validation passed24 schemas/1063 refs/38 positive/11 negative examples/11 Skill manifests/171 document links. Both production dependency audits reported0 vulnerabilities.

Full suite log: /tmp/aios-bootstrap-full.log; compiled logs: /tmp/aios-http-bootstrap-compiled.log and /tmp/aios-bootstrap-compiled-other.log; Docker log: /tmp/aios-http-bootstrap-docker.log. PostgreSQL17, Node24; Docker context colima-aios-seo, immutable HTTP image06921e104ac0b535a56095cde72971d1844e5420e5010cb9ff25367851f0297c. No new container image build was required.

Regression coverage includes exact permission/version/procedure, generic lease denial before reservation/container, immutable descriptor and raw SQL bypass, current cancellation/deletion/revocation, scope membership and byte/source tampering, frozen-manifest integrity, lock-free artifact reads fenced after cancellation, retry budget and actual PostgreSQL restart. Initial specification validation failed because new draft fixture scenario IDs were unregistered; added explicit linked scenarios and reran successfully. The frozen-bundle defect was caught in independent review and fixed before the passing full run. No accepted Evidence, generic child completion, public traffic, customer content or website writes.
