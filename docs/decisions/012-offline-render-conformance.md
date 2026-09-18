# ADR-012: isolated offline render conformance

Status: Accepted reversible local engineering decision.
Date: 2026-09-18.
Authority: continuous read-only implementation mandate; no production privacy or external authority grant.

## Decision and workload

N1 needs real JavaScript execution and timed DOM sampling, but customer-domain rendering requires N0 approval and independently enforced public egress. Implement a separate, one-shot synthetic replay worker and executable container tests now. Feed only explicit `.example` fixture HTML. Deny all container networking and all additional browser resources, reporting the resulting policy limitations. This advances the Linux/browser isolation prerequisite without inventing live observations or weakening activation gates.

Use the specified Playwright/Chromium approach from ADR-004, pin Playwright 1.63.0 and the official development-image manifest digest, verify actual sandbox status and bound the entire process. Keep the worker's dependencies separate from API/DB services. The image includes Node24. The fixed test harness supplies no host mounts, secrets or Docker socket and force-removes every container even after client timeout. This is local conformance; production image hardening, independent egress, governed render admission/budgets and accepted render evidence remain open.

## Sandbox compatibility

Upstream Playwright's seccomp profile permits user-namespace setup. Under `--cap-drop ALL`, Chromium additionally needs `chroot` allowed by seccomp inside its namespace. Permit that syscall while keeping outer capabilities empty, no-new-privileges, read-only root and network-none. Actual probes require namespace, PID, network and seccomp browser sandboxes. Never fall back to `--no-sandbox`, privileged containers or host IPC/network. Terminal receipts end the one-shot process so late asynchronous browser setup cannot outlive acceptance.

## Sources and validation

[Playwright Docker guidance](https://playwright.dev/docs/docker) documents the testing-only image limitation and namespace/seccomp requirements. The [pinned upstream profile](https://github.com/microsoft/playwright/blob/v1.63.0/utils/docker/seccomp_profile.json) is vendored with its license. The [worker runbook](../../workers/render-fixture/README.md) describes the exact boundary and executable tests. Record actual verification in the N1 report; the ordinary specification validator is not sandbox certification.
