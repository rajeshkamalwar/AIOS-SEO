# AIOS-SEO

Canonical product vision and architecture for a mobile-first autonomous Search Growth Brain.

Core loop: **Understand → Observe → Diagnose → Prioritize → Strategize → Act → Verify → Measure → Learn → Repeat.**

Primary law: **Backend speaks SEO. Frontend speaks business.**

**The Brain may reason freely, but it acts only through governed skills and explicit tools.**

## Status

This repository contains canonical specifications and the tested M1 persistence foundation. The complete Search Brain is not implemented yet. Documents 00–06 establish canonical product intent. Documents 07–13 contain the architecture readiness review and proposed implementation contracts, boundaries and decision gates. Documents 14–23 define the Phase 2 capability universe, skill/source governance, archetype activation and the first read-only Brain slice. Documents24–39 close Phase3 contracts and record accepted engineering defaults. Document39 declares readiness for the narrowly scoped M1 in38; production and later milestones remain gated.

## Required reading order

Read [AGENTS.md](AGENTS.md) completely first, then this README, then every document below in numerical order:

1. [00 — Product Constitution](docs/00-CONSTITUTION.md)
2. [01 — Canonical Vision](docs/01-CANONICAL-VISION.md)
3. [02 — Complete Search / SEO Universe](docs/02-SEO-UNIVERSE.md)
4. [03 — Parallel Brain Architecture](docs/03-BRAIN-ARCHITECTURE.md)
5. [04 — Skills, Agents, Tools and Sensors](docs/04-SKILLS-AGENTS-TOOLS.md)
6. [05 — Opportunity, Action and Learning](docs/05-OPPORTUNITY-ACTION-LEARNING.md)
7. [06 — Client, Expert and Visual Brain Experience](docs/06-CLIENT-EXPERT-VISUAL.md)
8. [07 — Architecture Readiness Review](docs/07-ARCHITECTURE-READINESS-REVIEW.md)
9. [08 — Domain Model](docs/08-DOMAIN-MODEL.md)
10. [09 — Evidence and Truth Model](docs/09-EVIDENCE-AND-TRUTH-MODEL.md)
11. [10 — Event and Temporal Model](docs/10-EVENT-AND-TEMPORAL-MODEL.md)
12. [11 — Autonomy and Governance](docs/11-AUTONOMY-AND-GOVERNANCE.md)
13. [12 — Technical Architecture Proposal](docs/12-TECHNICAL-ARCHITECTURE-PROPOSAL.md)
14. [13 — Implementation Dependencies](docs/13-IMPLEMENTATION-DEPENDENCIES.md)
15. [14 — Capability Taxonomy](docs/14-CAPABILITY-TAXONOMY.md)
16. [15 — Capability Contract](docs/15-CAPABILITY-CONTRACT.md)
17. [16 — SEO Skills Architecture](docs/16-SEO-SKILLS-ARCHITECTURE.md)
18. [17 — Knowledge Source Governance](docs/17-KNOWLEDGE-SOURCE-GOVERNANCE.md)
19. [18 — Business Archetype Matrix](docs/18-BUSINESS-ARCHETYPE-MATRIX.md)
20. [19 — First Read-Only Brain Slice](docs/19-READ-ONLY-BRAIN-SLICE.md)
21. [20 — Client Interpretation Model](docs/20-CLIENT-INTERPRETATION-MODEL.md)
22. [21 — Brain Self-Audit](docs/21-BRAIN-SELF-AUDIT.md)
23. [22 — Reference Architectures](docs/22-REFERENCE-ARCHITECTURES.md)
24. [23 — Phase 2 Gap Review](docs/23-PHASE-2-GAP-REVIEW.md)

25. [24 — Decision Register](docs/24-DECISION-REGISTER.md)
26. [25 — Physical Domain Schemas](docs/25-PHYSICAL-DOMAIN-SCHEMAS.md)
27. [26 — Temporal Evidence Contract](docs/26-TEMPORAL-EVIDENCE-CONTRACT.md)
28. [27 — Knowledge Graph Contract](docs/27-KNOWLEDGE-GRAPH-CONTRACT.md)
29. [28 — Skill Manifest Spec](docs/28-SKILL-MANIFEST-SPEC.md)
30. [29 — Sensor Connector Contract](docs/29-SENSOR-CONNECTOR-CONTRACT.md)
31. [30 — Crawl Render Contract](docs/30-CRAWL-RENDER-CONTRACT.md)
32. [31 — Model Gateway](docs/31-MODEL-GATEWAY.md)
33. [32 — Agent Mission Contract](docs/32-AGENT-MISSION-CONTRACT.md)
34. [33 — Event Job Contract](docs/33-EVENT-JOB-CONTRACT.md)
35. [34 — Security Tenancy Data](docs/34-SECURITY-TENANCY-DATA.md)
36. [35 — Quality Self Audit Gates](docs/35-QUALITY-SELF-AUDIT-GATES.md)
37. [36 — Read Only Acceptance Test](docs/36-READ-ONLY-ACCEPTANCE-TEST.md)
38. [37 — Implementation Architecture](docs/37-IMPLEMENTATION-ARCHITECTURE.md)
39. [38 — First Slice Implementation Plan](docs/38-FIRST-SLICE-IMPLEMENTATION-PLAN.md)
40. [39 — Phase 3 Readiness Review](docs/39-PHASE-3-READINESS-REVIEW.md)

Then read [ADRs001–006](docs/decisions/001-transactional-domain-core.md) in filename order and [spec/README.md](spec/README.md), all schemas, examples and fixtures.

## Engineering boundary

Preserve the persistent, domain-native Brain. Do not reinterpret it as a conventional SEO dashboard, a SEMrush/Ahrefs clone, disconnected tools, a generic chatbot or a website builder.

Surface conflicts with the constitution and record accepted changes explicitly. Start with the findings in 07 and decision gates in 13 before requesting application implementation. Specification phases do not scaffold the application. Read documents38–39 for the current implementation boundary; all website mutations remain out of scope for the first slice.

## Local M1 verification

Requires Node24 and PostgreSQL17 binaries (`PG_BIN` if not on PATH). No customer URL, credentials, model account or existing database is needed.

```sh
npm ci --ignore-scripts
npm run typecheck
npm run build
npm test
```

`npm test` creates a private disposable PostgreSQL cluster using Unix sockets, runs the real storage/isolation/restart suite, then removes it. It never uses an existing database service. On Homebrew, PostgreSQL17 can coexist with other installed versions; set `PG_BIN=/opt/homebrew/opt/postgresql@17/bin` when needed. The blob adapter accepts only the local synthetic profile.

The compiled libraries and their schemas/migrations are in ignored `dist/`. M1 has no server or UI to launch. See [M1 results](reports/M1-IMPLEMENTATION.md) and [M2 results](reports/M2-IMPLEMENTATION.md). Sequential implementation through M5 is authorized under document38; M2 durable governed work is complete and M3 public perception is next. Website collection and write capabilities remain separately gated.
