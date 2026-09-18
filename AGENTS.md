# AGENTS.md — AIOS SEO Constitution

1. This product is an SEO/Search Growth Brain, not a generic website builder.
2. URL-first onboarding; infer before asking.
3. Client UX is mobile-first, non-technical and outcome-oriented.
4. Every autonomous action maps to Search Understanding, Search Growth or Search Protection.
5. Strategy Brain decides why/what; bounded agents decide how.
6. Agents act through governed, versioned skills and explicit tools.
7. Official search-engine guidance and first-party evidence outrank SEO folklore.
8. Significant mutations require evidence, confidence, risk and reversibility assessment.
9. High-blast-radius actions cannot silently auto-deploy.
10. Preserve existing wins; every mutation is auditable and preferably reversible.
11. Evaluation criteria cannot be silently changed by the experimenting agent after results.
12. Never promise rankings or present correlation as causality.
13. Never turn the default client UI into an SEO-professional dashboard.
14. Never add a feature merely because a competitor has it.
15. The visual Brain must represent real system state, not decorative fake intelligence.
16. Tenant-specific knowledge remains isolated.
17. Surface architecture drift instead of silently normalizing it.
18. Reject work that does not improve understanding, growth, protection, measurement, learning or meaningful client interpretation.

## Repository control vault maintenance

The repository root is the Obsidian vault. Read [vault/00-HOME.md](vault/00-HOME.md) and its current-state/gap indexes after the canonical reading order. The vault is a derived control layer, not a competing specification. Do not copy canonical contracts into it or promote fixture tests to real-world/production proof.

Every implementation checkpoint must update its existing report, impacted capability/milestone records and append-only gap histories. Run `npm run vault:update` to refresh CURRENT-STATE, COVERAGE-MATRIX, GAP-REGISTER, MILESTONE-TRACKER and TEST-TRACEABILITY together; run `npm run vault:check` and `python3 vault/refresh.py --check --base <previous-checkpoint>` before commit. Record actual outcomes, commit/push and continue dependency-ready work. Maintenance is part of milestone completion, never a separate permission boundary. Preserve permanent IDs and historical gap/decision evidence. No COMPLETE claim is allowed without the scoped Definition of Complete in the vault and canonical acceptance evidence.
