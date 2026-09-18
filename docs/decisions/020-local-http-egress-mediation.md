# ADR-020: isolated local HTTP collection with one-hop mediation

Status: Accepted reversible local engineering default.
Date: 2026-09-18.

[ADR-015](015-local-http-process-supervision.md) proves a fixed host child's termination, but does not stop a compromised collector from opening another socket. Progress [30](../30-CRAWL-RENDER-CONTRACT.md), [34](../34-SECURITY-TENANCY-DATA.md) and GAP-007 with an independently isolated local fixture collector. The deployment/owner gates and public egress requirements remain unchanged.

Use a minimal immutable Node container because this worker only handles bounded messages; it needs no browser or application dependencies. Run as nonroot with a read-only root filesystem, dropped capabilities, no-new-privileges, bounded memory/CPU/processes, no host mounts or secrets, and Docker `network=none`. Docker's [none network driver](https://docs.docker.com/engine/network/drivers/none/) leaves only container loopback. This is an OS-enforced absence of external networking, not merely a client-library address check. The trusted Docker control plane remains outside the worker.

The worker receives no URL, destination, headers, credentials or port. Its single closed-protocol request asks the host broker to execute the immutable invocation's one pre-authorized fixture hop. Extra fields, repeated requests, malformed framing and output overflow fail closed. The broker alone holds the trusted loopback fixture port and calls the fixed GET `/robots.txt`; no worker-selected command or destination exists. This transport substitution is explicitly synthetic. A logical `.example` HTTPS URL is not evidence of TLS validation or a public DNS request.

Reserve the HTTP lane before creating the container. Bind the independently authenticated supervisor invocation to the immutable image, container and input context; recheck current admission immediately before container start and again immediately before the broker creates its socket. Snapshot caller-owned input before asynchronous work. A redirect is observed without following it: another hop would require its own independent admission/accounting. The existing pinned transport supplies bounded headers, MIME handling, decoded/transfer limits and timeout behavior. Neither proxy environment variables nor worker output can change its fixed destination.

Return only bounded status, truncation and retained-body length/hash metadata; do not upload or accept response bodies. Validate the worker transcript against the independently observed broker result. Retained body length is not full decoded-byte accounting; preserve the reservation's worst-case charge and report actual decoded bytes as unknown.

Terminal accounting requires both independently verified container termination/removal/absence and actual broker request/socket closure. `destroy()`, successful signal delivery, timeout, CLI exit, a worker message or a metadata result alone is insufficient. Abort propagates into the broker; uncertainty leaves the durable slot charged. Current-gate failures and host loss never manufacture a witness. Existing separately governed recovery remains necessary for unresolved reservations.

Controlled local origins, denied-destination probes and malicious protocol fixtures validate this bounded boundary. They do not close GAP-007's deployed public proxy/firewall, public TLS/DNS, redirects and live-resource requirements, do not accept Evidence or complete crawl jobs, and do not grant customer or website-write authority. Raw retention remains separately tracked by GAP-039.
