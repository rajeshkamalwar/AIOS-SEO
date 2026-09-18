import { resolveAddresses } from "./dns.js";
import { isIP } from "node:net";
import { normalizeUrl } from "./url.js";
import { isGlobalAddress } from "./address.js";
import { requestPinned, safeHeaders, supportedMime, redirectCodes, type Address, type Response } from "./transport.js";

export type CollectorReceipt = { requestedUrl: string; finalUrl: string; status: number; headers: Record<string, string>; body: Buffer | null; redirects: string[]; truncated: boolean };
export type CollectorOptions = {
  maxBytes?: number; maxRedirects?: number; timeoutMs?: number; dnsTimeoutMs?: number;
  lookupAll?: (host: string) => Promise<Address[]>;
  transport?: (url: URL, address: Address, options: { maxBytes: number; timeoutMs: number }) => Promise<Response>;
};
function bound(value: number | undefined, ceiling: number, minimum = 1): number {
  const n = value ?? ceiling;
  if (!Number.isSafeInteger(n) || n < minimum || n > ceiling) throw new Error("collector_limits");
  return n;
}
function admitted(raw: string, base?: string): URL {
  const decision = normalizeUrl(raw, base);
  if (decision.excluded) throw new Error("action_like");
  return new URL(decision.url);
}
async function resolvePublic(host: string, options: CollectorOptions, timeout: number): Promise<Address> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answers = await Promise.race([
      (options.lookupAll ? options.lookupAll(host) : resolveAddresses(host, timeout)),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("dns_timeout")), timeout); }),
    ]);
    if (!answers.length || answers.length > 64 || answers.some(x => isIP(x.address) !== x.family || !isGlobalAddress(x.address))) throw new Error("private_destination");
    return answers[0]!;
  } finally { clearTimeout(timer); }
}

// Durable admission, robots, budget reservation and deployment authorization
// belong to the governed dispatcher; URL validation alone grants no authority.
export type HopReceipt = CollectorReceipt & { nextUrl: string | null };
export async function collectPublicPage(rawUrl: string, options: CollectorOptions = {}): Promise<CollectorReceipt> {
  const { nextUrl: _next, ...receipt } = await collect(rawUrl, options, false);
  return receipt;
}
export async function collectPublicHop(rawUrl: string, options: CollectorOptions = {}): Promise<HopReceipt> {
  return collect(rawUrl, options, true);
}
async function collect(rawUrl: string, options: CollectorOptions, singleHop: boolean): Promise<HopReceipt> {
  const maxBytes = bound(options.maxBytes, 5242880), timeoutMs = bound(options.timeoutMs, 20000);
  const maxRedirects = bound(options.maxRedirects, 5, 0), dnsTimeout = bound(options.dnsTimeoutMs, 3000);
  let current = admitted(rawUrl);
  const redirects: string[] = [];
  const deadline = performance.now() + timeoutMs;
  let remainingBytes = maxBytes;
  for (let hop = 0; ; hop++) {
    let remaining = Math.ceil(deadline - performance.now());
    if (remaining <= 0) throw new Error("collector_timeout");
    const address = await resolvePublic(current.hostname, options, Math.min(dnsTimeout, remaining));
    remaining = Math.ceil(deadline - performance.now());
    if (remaining <= 0) throw new Error("collector_timeout");
    const response = await (options.transport ?? requestPinned)(current, address, { maxBytes: remainingBytes, timeoutMs: remaining });
    if (response.body && response.body.length > remainingBytes) throw new Error("collector_transport_overflow");
    remainingBytes -= response.body?.length ?? 0;
    if (redirectCodes.has(response.status) && response.headers.location) {
      if (!singleHop && hop >= maxRedirects) throw new Error("redirect_budget");
      const next = admitted(response.headers.location, current.toString());
      if (next.origin !== current.origin) throw new Error("redirect_origin_changed");
      if (singleHop) return { requestedUrl: rawUrl, finalUrl: current.toString(), status: response.status, headers: safeHeaders(response.headers), body: null, redirects, truncated: response.truncated, nextUrl: next.toString() };
      redirects.push(next.toString()); current = next; continue;
    }
    return { requestedUrl: rawUrl, finalUrl: current.toString(), status: response.status, headers: safeHeaders(response.headers), body: supportedMime(response.headers["content-type"]) ? response.body : null, redirects, truncated: response.truncated, nextUrl: null };
  }
}
