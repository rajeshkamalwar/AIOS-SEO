# Capability note template

Use an existing CAP ID from14; do not mint canonical capabilities here. Copy the frontmatter structure from an existing capability note. Required fields: id/title/domain/maturity/local_maturity/completion/specs/implementation/tests/reports/gaps/scope. Record exact required applicable stages and evidence before any promotion. Empty implementation/test references mean missing evidence, not pass. Link the contract rather than reproducing it. Append history of promotions/regressions with scope, baseline and review.

```yaml
---
id: "CAP-EXISTING-00"
title: "Existing canonical capability name"
domain: "EXISTING"
maturity: "DEFINED"
local_maturity: "NOT_DEFINED"
local_scope_kind: "specification_only"
completion: "INCOMPLETE"
specs: []
implementation: []
tests: []
reports: []
gaps: []
scope: "Exact reviewed scope; no implied full delivery"
---
```

## History

Append date, lifecycle/maturity transition, exact source evidence and scope limitation. Never overwrite prior entries.
