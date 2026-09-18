# Milestone note template

Use an existing canonical milestone or a narrowly scoped engineering checkpoint, never invent a broad phase. Include id/title/order/maturity/status/scope/baseline/specs/implementation/tests/reports/evidence_date/gaps and actual normal_tests/compiled_tests/docker_tests (null if unrun). Read referenced contracts before implementation. Record environment, failures and limitations. Update capability/gap notes, run npm run vault:update, then npm run vault:check. All five generated state views are part of the same checkpoint; no automatic maturity promotion.

```yaml
---
id: "EXISTING-MILESTONE-OR-SCOPED-CHECKPOINT"
title: "Checkpoint title"
order: 99
maturity: "DEFINED"
status: "IN_PROGRESS"
scope: "Authorized scope"
baseline: null
specs: []
implementation: []
tests: []
reports: []
normal_tests: null
compiled_tests: null
docker_tests: null
gaps: []
---
```

## History

Append date, lifecycle/maturity transition, exact source evidence and scope limitation. Never overwrite prior entries.
