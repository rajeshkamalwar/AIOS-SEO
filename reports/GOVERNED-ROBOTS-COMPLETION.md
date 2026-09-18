# Governed local robots result and completion

Baseline:f5402a1. [ADR-024](../docs/decisions/024-governed-local-robots-completion.md) defines the bounded scope.

Scoped implementation and verification passed on2026-09-19. No PageSnapshot, crawl completion, automatic dispatch or public/customer/write authority.

Review identified that HTML containing a colon can otherwise parse as empty robots rules. The adapter therefore withholds non-text/plain/error-bearing ordinary responses from parsing, preserving unknown and existing status precedence. Matching regression required before closure.

First focused integration run:26/27 passed. The terminal-witness integrity regression exposed a missing link between the accepted mapping's original input hash and the currently stored terminal digest; a privileged historical corruption fixture could otherwise complete projection. The fix must recompute that acceptance binding against the persisted invocation/witness before completion and replay. No passing checkpoint claimed until rerun.

Verification: 584 application tests passed (578 primary plus6 API scope), with10 separate vault guards. Focused source28/28 and compiled28/28 passed;61 additional compiled tests passed (89 compiled total). Actual Docker suite29/29 passed, with28 overlapping protocol/integration cases plus1 actual isolated container→broker→accepted robots→typed result→atomic fetch completion path. Typecheck/build and specification validation passed (26 schemas/1072 refs/40 positive/13 negative/11 Skill manifests/183 document links). Both production audits reported0 vulnerabilities.

Logs: /tmp/aios-robots-completion-full.log, /tmp/aios-http-projection-test.log, /tmp/aios-http-projection-compiled.log, /tmp/aios-robots-completion-compiled-other.log, /tmp/aios-http-projection-docker.log. PostgreSQL17/Node24; Docker context colima-aios-seo, unchanged HTTP image06921e104ac0b535a56095cde72971d1844e5420e5010cb9ff25367851f0297c.

Correction verified: projection now recomputes the original acceptance input hash against stored terminal receipt/digest and invocation build/context before initial completion and replay, in both service and SQL. Regression exercises each altered component and completed replay. Independent review confirms matching canonical hash construction. Accepted record associations still rely on the trusted atomic acceptance boundary and immutable database records; this is not external tamper-proof storage against a database owner rewriting all history.

No full capability promotion: this is TESTED local fixture scope. Unknown/denied job results remain explicit and grant no dispatch. No new PageSnapshot, raw collection, crawl completion or customer processing is introduced.
