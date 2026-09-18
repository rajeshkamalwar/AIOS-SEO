import { request as httpRequest, type ClientRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createGunzip, createInflate, createBrotliDecompress, type Gunzip } from "node:zlib";
import type { Readable } from "node:stream";

export type Address = { address: string; family: 4 | 6 };
export type Response = { status: number; headers: Record<string, string>; body: Buffer | null; truncated: boolean };
export type TransportLimits = { maxBytes: number; timeoutMs: number };
export const redirectCodes = new Set([301, 302, 303, 307, 308]);
export function supportedMime(value = ""): boolean {
  return /^(text\/html|application\/xhtml\+xml|text\/plain|application\/xml|text\/xml)$/.test(value.split(";", 1)[0]!.trim().toLowerCase());
}
export function safeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([k,v]) => ["content-type", "content-length", "content-encoding", "last-modified", "etag", "x-robots-tag", "retry-after"].includes(k) && v.length <= 4096));
}

// Internal transport: callers must have admitted the URL and every DNS answer.
// Tests exercise it with loopback fixtures; not exported by the package facade.
export function requestPinned(url: URL, address: Address, limits: TransportLimits): Promise<Response> {
  return requestPinnedObserved(url,address,limits,()=>{});
}
// Trusted host lifecycle hook only. Response settlement does NOT prove socket
// closure; a supervisor must independently observe request/socket close events.
export function requestPinnedObserved(url: URL, address: Address, limits: TransportLimits, observe:(request:ClientRequest)=>void): Promise<Response> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let response: Readable | undefined;
    let decoder: Gunzip | undefined;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    let headerTimer: ReturnType<typeof setTimeout> | undefined;
    const chunks: Buffer[] = [];
    let size = 0, transferred = 0;
    const finish = (error?: Error, value?: Response) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline); clearTimeout(connectTimer); clearTimeout(headerTimer);
      response?.destroy(); decoder?.destroy(); req.destroy();
      if (error) reject(error); else resolve(value!);
    };
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)({
      hostname: url.hostname, port: url.port || undefined, path: url.pathname + url.search,
      method: "GET", agent: false, maxHeaderSize: 32768,
      headers: { Host: url.host, "User-Agent": "AIOSSEOResearchBot/0.1", "Accept-Encoding": "gzip, deflate, br", Accept: "text/html,application/xhtml+xml,text/plain,application/xml,text/xml" },
      lookup: (_host, options, callback) => options.all ? callback(null, [address]) : callback(null, address.address, address.family),
      ...(url.protocol === "https:" ? { servername: url.hostname, rejectUnauthorized: true } : {}),
    }, res => {
      response = res;
      clearTimeout(headerTimer);
      const headers = Object.fromEntries(Object.entries(res.headers).map(([k,v]) => [k, Array.isArray(v) ? v.join(",") : v ?? ""]));
      const base = { status: res.statusCode ?? 0, headers, truncated: false };
      res.on("error", error => finish(error));
      res.on("aborted", () => finish(new Error("collector_interrupted")));
      if (redirectCodes.has(base.status) || !supportedMime(headers["content-type"])) {
        finish(undefined, { ...base, body: null }); return;
      }
      const encoding = (headers["content-encoding"] ?? "identity").trim().toLowerCase();
      if (!["identity", "gzip", "deflate", "br"].includes(encoding)) { finish(new Error("content_encoding_unsupported")); return; }
      if (encoding !== "identity") decoder = encoding === "gzip" ? createGunzip() : encoding === "deflate" ? createInflate() : createBrotliDecompress();
      const stream = decoder ?? res;
      const overflow = () => finish(undefined, { ...base, body: Buffer.concat(chunks), truncated: true });
      // Bound transfer and decoded output independently; never drain hostile bodies.
      res.on("data", (chunk: Buffer) => { transferred += chunk.length; if (transferred > limits.maxBytes && decoder) overflow(); });
      stream.on("data", (chunk: Buffer) => {
        if (settled) return;
        const remaining = limits.maxBytes - size;
        const kept = chunk.subarray(0, remaining);
        chunks.push(kept); size += kept.length;
        if (chunk.length > remaining) overflow();
      });
      stream.on("error", error => finish(error));
      stream.on("end", () => finish(undefined, { ...base, body: Buffer.concat(chunks) }));
      if (decoder) res.pipe(decoder);
    });
    const deadline = setTimeout(() => finish(new Error("collector_timeout")), limits.timeoutMs);
    headerTimer = setTimeout(() => finish(new Error("collector_header_timeout")), Math.min(10000, limits.timeoutMs));
    req.on("socket", socket => {
      connectTimer = setTimeout(() => finish(new Error("collector_connect_timeout")), Math.min(5000, limits.timeoutMs));
      socket.once(url.protocol === "https:" ? "secureConnect" : "connect", () => clearTimeout(connectTimer));
    });
    req.on("error", error => finish(error));
    try { observe(req); } catch(error) { finish(error instanceof Error?error:new Error("transport_observer_failed")); return; }
    req.end();
  });
}
