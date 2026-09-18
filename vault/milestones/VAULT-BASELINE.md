---
id: "VAULT-BASELINE"
title: "Repository-linked Obsidian control baseline"
order: 15
maturity: "TESTED"
status: "BASELINE_VERIFIED"
scope: "Control-layer inventory and local conformance only"
baseline: "2b6d527"
specs: ["README.md", "AGENTS.md", "docs/14-CAPABILITY-TAXONOMY.md"]
implementation: ["vault/refresh.py"]
tests: ["vault/refresh.py", "spec/validate.py"]
reports: ["vault/milestones/VAULT-BASELINE.md"]
normal_tests: null
compiled_tests: null
docker_tests: null
evidence_date: "2026-09-18"
gaps: ["GAP-025", "GAP-026"]
---

# Vault baseline

Baseline inspection:2b6d527, all45ancestor commits, both open PRs and tracked repository artifacts. All11control pages,195capability notes,36domain delivery gaps and original R/D/S histories are linked, without copying canonical definitions.

Independent reviews checked195/36IDs,45commit anchors, tracked artifact inventory, status scope and generated-view consistency. Corrections included historic dates, root/script source drift detection, permanent-ID/history preservation at --base, and stale README current-status text.

Validation: `npm run vault:update`, `npm run vault:check`, specification validation and `git diff --check` pass. A fresh `npm test` run passes353/353 at unchanged application code. The existing N1 report retains26compiled/13Docker results; neither was rerun for this documentation baseline. No maturity or authority promotion.

Next dependency-ready read-only work: [GAP-025](../gaps/GAP-025.md) and [GAP-026](../gaps/GAP-026.md). Their fixes must append history and update all five views in the same checkpoint. Owner-approved N0 commitments remain a gate for live customer processing, not these local fixes.
