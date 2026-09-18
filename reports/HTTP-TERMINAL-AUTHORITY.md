# HTTP invocation and terminal authority checkpoint

Baseline dc7ce96; read-only N1 accounting prerequisite GAP-005.

Inspection showed that scheduler settlement accepted its own byte assertion and SQL privileges allowed direct reservation/counter mutation. Regression tests reproduced both defects before implementation. ADR-014 and the narrow doc33 operational contract distinguish reservation identity, planned supervisor invocation binding, independently authenticated terminal witness and scheduler accounting settlement.

The local supervisor is a distinct NOLOGIN-by-default database role, never collector/browser credentials. Fixture authority exercises the protocol; this does not implement or prove real process termination, owned egress cleanup, live dispatch or customer activation. GAP-005/GAP-004 remain open for that integration. Unknown measurements retain worst-case charges and never fabricate zero bytes.

Final npm test passes **391 main-process cases +6 separate API-scope cases =397 application tests**, plus10 vault guard tests; zero application failures/skips. The main count includes12 nested SQL-role cases. Compiled API/perception/understanding:45 passed. Typecheck/build pass. Specification validator passes21 schemas/1035 references/126 document links. Root and render-worker production dependency audits report zero vulnerabilities. Docker code is unchanged and was not rerun.

Tests cover exact immutable binding/transcript replay, conflicting identity/context/bytes, role and direct-SQL bypass denial, unknown-byte terminal settlement, cancelled/revoked work, global alias accounting, permanent charges, PostgreSQL crash/restart and current SQL admission gates. A legacy-null-ID fixture verifies fail-closed behavior; this is not an actual historical-data upgrade rehearsal. Independent review drove the atomic creation, charge guard and direct SQL gate corrections. No full capability or real-world maturity promotion.

Review refinements: reservation, permanent charge and global lane increment are one SQL command; no raw scheduler reservation INSERT can create a ghost slot. Backing HTTP charges are immutable. Direct SQL admission checks persisted membership, health and current release eligibility under the registry/work lock order. Independently retained deletion remains an adapter gate; accounting functions grant no dispatch authority. Migration does not backfill old reservations with usable invocation IDs, preventing retrospective proof for an unknown old worker.
