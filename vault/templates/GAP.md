# Gap note template

Allocate an unused permanent GAP ID. Include title/status/severity/scope/owner_role/specs/implementation/tests/reports/closure_required and append-only History. Start OPEN unless importing a clearly evidenced historical stage. Use OPEN → FIX_IN_PROGRESS → FIXED → TESTED → VERIFIED → CLOSED. CLOSED requires closure_evidence and explicit scope; do not erase reopened history or close related deployment gaps by implication.

```yaml
---
id: "GAP-UNUSED-ID"
title: "Concrete missing behavior or evidence"
status: "OPEN"
severity: "HIGH"
scope: "Scope and conditional exposure"
owner_role: "Accountable role"
specs: []
implementation: []
tests: []
reports: []
closure_required: "Explicit verifiable condition"
---
```

## History

Append date, lifecycle/maturity transition, exact source evidence and scope limitation. Never overwrite prior entries.
