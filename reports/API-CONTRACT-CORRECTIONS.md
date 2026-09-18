# API contract corrections

Baseline d7b721b. Local injected-principal adapter only; no deployed authentication or external observation authority.

GAP-028: missing publication now returns schema-shaped 503 projection_pending with Retry-After. Errors use classified allowlisted codes and per-request IDs without exception text. Input and output schema failures are distinguished; serialized command/result budgets are enforced. Advanced idempotent submission returns current Run, cancellation returns Run. Jobs admission retains its locking, health, membership, deletion and budget fences.

Four API regressions failed before correction. Combined application runner: 369 passed; compiled perception/understanding: 33 passed. Typecheck/build and specification conformance pass; root and render-worker production dependency audits report zero vulnerabilities. Docker worker unchanged; no new Docker execution claimed. Graph query/history/cursor implementation remains open; this report does not close GAP-028.

Independent review identified GAP-030 (publication authority/current eligibility) and GAP-031 (site-limited run authorization). Both require their own correction. Existing arbitrary test-authored publication rows do not prove governed publication. Full product maturity remains unchanged.

Independent boundary review corrections: validate resource UUIDs before store access, enforce command bytes for cancellation, and use canonical URL admission for forbidden action routes/credential destinations. Final npm test includes10 passing vault guards and369 application tests.
