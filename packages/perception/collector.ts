import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

export type CollectorReceipt = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer | null;
  redirects: string[];
  truncated: boolean;
};

type Address = { address: string; family: 4 | 6 };
type Response = { status: number; headers: Record<string, string>; body: Buffer; truncated: boolean };
export type CollectorOptions = { maxBytes?: number; maxRedirects?: number; timeoutMs?: number; lookupAll?: (host: string) => Promise<Address[]>; transport?: (url: URL, address: Address, options: CollectorOptions) => Promise<Response> };

function globalAddress(address: string): boolean {
  if (address.includes(":")) return !/^(::|::1|fc|fd|fe8|fe9|fea|feb)/i.test(address);
  const p = address.split(".").map(Number); if (p.length !== 4 || p.some(n => !Number.isInteger(n))) return false;
  const [a, b] = p as [number, number];
  return a !== 10 && a !== 127 && !(a === 169 && b === 254) && !(a === 192 && b === 168) && !(a === 172 && b >= 16 && b <= 31) && a !== 0 && a < 224;
}

async function resolvePublic(host: string, lookupAll = (name: string) => lookup(name, { all: true, verbatim: true }) as Promise<Address[]>): Promise<Address> {
  const addresses = await lookupAll(host);
  if (!addresses.length || addresses.some(x => !globalAddress(x.address))) throw new Error("private_destination");
  return addresses[0]!;
}

function requestPinned(url: URL, address: Address, options: CollectorOptions): Promise<{ status: number; headers: Record<string, string>; body: Buffer; truncated: boolean }> {
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = requestFn({ hostname: address.address, port: url.port || (url.protocol === "https:" ? 443 : 80), path: `${url.pathname}${url.search}`, method: "GET", headers: { Host: url.host, "User-Agent": "AIOSSEOResearchBot/0.1", Accept: "text/html,application/xhtml+xml,text/plain,application/xml" }, timeout: timeoutMs, lookup: (_host, _opts, cb) => cb(null, address.address, address.family), servername: url.hostname }, res => {
      const chunks: Buffer[] = []; let size = 0; let truncated = false;
      res.on("data", chunk => { const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); if (size < maxBytes) { const keep = part.subarray(0, maxBytes - size); chunks.push(keep); size += keep.length; } if (size >= maxBytes && part.length > maxBytes - size + part.length) truncated = true; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v ?? "")])), body: Buffer.concat(chunks), truncated }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("collector_timeout")));
    req.on("error", reject); req.end();
  });
}

export async function collectPublicPage(rawUrl: string, options: CollectorOptions = {}): Promise<CollectorReceipt> {
  let current = new URL(rawUrl); if (!['http:', 'https:'].includes(current.protocol) || current.username || current.password || current.port || /^\d+(?:\.\d+){3}$/.test(current.hostname) || current.hostname.includes(":")) throw new Error("url_forbidden");
  const redirects: string[] = []; const maxRedirects = options.maxRedirects ?? 5;
  for (let hop = 0; ; hop++) {
    const address = await resolvePublic(current.hostname, options.lookupAll);
    const response = await (options.transport ? options.transport(current, address, options) : requestPinned(current, address, options));
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      if (hop >= maxRedirects) throw new Error("redirect_budget");
      const next = new URL(response.headers.location, current); if (next.hostname !== current.hostname || next.protocol !== current.protocol || next.port || /^\d+(?:\.\d+){3}$/.test(next.hostname) || next.hostname.includes(":")) throw new Error("redirect_origin_changed");
      redirects.push(next.toString()); current = next; continue;
    }
    const mime = response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    return { requestedUrl: rawUrl, finalUrl: current.toString(), status: response.status, headers: response.headers, body: /^(text\/html|application\/xhtml\+xml|text\/plain|application\/xml)$/.test(mime) ? response.body : null, redirects, truncated: response.truncated };
  }
}
