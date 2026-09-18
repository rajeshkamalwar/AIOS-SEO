import assert from "node:assert/strict";
import { test } from "node:test";
import { collectPublicPage } from "../packages/perception/collector.js";

const publicAnswer = async () => [{ address: "93.184.216.34", family: 4 as const }];
const html = async () => ({ status: 200, headers: { "content-type": "text/html" }, body: Buffer.from("ok"), truncated: false });

test("special-use, malformed, mapped and mixed DNS answers never dispatch", async () => {
  const blocked = ["0.1.2.3", "10.0.0.1", "100.64.0.1", "100.127.255.255", "127.0.0.2", "169.254.169.254", "172.31.0.1", "192.0.0.9", "192.0.2.1", "192.88.99.2", "192.168.0.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1", "999.1.1.1", "::", "::1", "0:0:0:0:0:ffff:7f00:1", "::ffff:8.8.8.8", "64:ff9b::a00:1", "100::1", "2001:db8::1", "2001::1", "2002:7f00:1::", "3fff::1", "fc00::1", "fe80::1", "ff02::1", "4000::1"];
  for (const address of blocked) {
    await assert.rejects(collectPublicPage("https://example.test/", {
      lookupAll: async () => [...await publicAnswer(), { address, family: address.includes(":") ? 6 : 4 }],
      transport: async () => { assert.fail(`dispatched ${address}`); },
    }), /private_destination/, address);
  }
});

test("admission policy applies before DNS and again on every redirect", async () => {
  for (const url of ["http://localhost/", "http://host/", "http://host.local/", "http://host.local./", "https://example.test/logout", "https://example.test/%6cogout", "https://example.test/?token=x", "https://example.test/?action=delete", "https://user@example.test/", "https://example.test/\\\\logout", "https://example.test/\n"]) {
    await assert.rejects(collectPublicPage(url, { lookupAll: publicAnswer, transport: html }), /url_|action_like/, url);
  }
  for (const location of ["https://u@example.test/x", "/?key=x", "/logout", "http://example.test/", "https://other.test/", "https://example.test:444/"]) {
    let dispatched = 0;
    await assert.rejects(collectPublicPage("https://example.test/", { lookupAll: publicAnswer, transport: async () => { dispatched++; return { ...await html(), status: 302, headers: { location } }; } }), /url_|action_like|redirect_origin_changed/);
    assert.equal(dispatched, 1);
  }
});

test("redirect DNS rebinding is rejected and fragments are never fetched", async () => {
  let resolutions = 0, dispatched = 0;
  await assert.rejects(collectPublicPage("https://example.test/#fragment", {
    lookupAll: async () => ++resolutions === 1 ? publicAnswer() : [{ address: "127.0.0.1", family: 4 }],
    transport: async url => { dispatched++; assert.equal(url.hash, ""); return { ...await html(), status: 302, headers: { location: "/next" } }; },
  }), /private_destination/);
  assert.equal(dispatched, 1);
});

test("limits cannot be disabled or raised beyond canonical ceilings", async () => {
  for (const options of [{ maxBytes: 0 }, { maxBytes: Infinity }, { maxBytes: 5242881 }, { maxRedirects: -1 }, { maxRedirects: 6 }, { timeoutMs: NaN }, { timeoutMs: 20001 }]) {
    await assert.rejects(collectPublicPage("https://example.test/", { ...options, lookupAll: publicAnswer, transport: html }), /collector_limits/);
  }
});

test("collector pins the resolved public address and retains supported HTML", async () => {
  const seen: string[] = [];
  const result = await collectPublicPage("https://example.test/", {
    lookupAll: async host => { seen.push(host); return [{ address: "93.184.216.34", family: 4 }]; },
    transport: async (_url, address) => { assert.equal(address.address, "93.184.216.34"); return { status: 200, headers: { "content-type": "text/html" }, body: Buffer.from("<html>ok</html>"), truncated: false }; },
  });
  assert.deepEqual(seen, ["example.test"]);
  assert.equal(result.body?.toString(), "<html>ok</html>");
});

test("collector rejects a private answer before opening a connection", async () => {
  await assert.rejects(() => collectPublicPage("https://example.test/", { lookupAll: async () => [{ address: "127.0.0.1", family: 4 }] }), /private_destination/);
});

import { createServer, type RequestListener } from "node:http";
import { gzipSync, deflateSync, brotliCompressSync } from "node:zlib";
import type { TestContext } from "node:test";
import { requestPinned } from "../packages/perception/transport.js";
import { isGlobalAddress } from "../packages/perception/address.js";

async function fixture(t: TestContext, handler: RequestListener): Promise<URL> {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return new URL(`http://fixture.invalid:${address.port}/`);
}
const loopback = { address: "127.0.0.1", family: 4 as const };
const cap = { maxBytes: 1024, timeoutMs: 1000 };

for (const bytes of [1023, 1024, 1025, 65536]) test(`real transport bounds ${bytes} bytes and reports truncation honestly`, async t => {
  const url = await fixture(t, (req, res) => {
    assert.equal(req.method, "GET"); assert.equal(req.headers.host, url.host);
    assert.equal(req.headers.authorization, undefined); assert.equal(req.headers.cookie, undefined);
    res.writeHead(200, { "Content-Type": "text/html" }); res.end(Buffer.alloc(bytes, 97));
  });
  const result = await requestPinned(url, loopback, cap);
  assert.equal(result.body?.length, Math.min(bytes, cap.maxBytes));
  assert.equal(result.truncated, bytes > cap.maxBytes);
});

test("multi-chunk overflow closes a stream that never ends", async t => {
  let closed!: () => void;
  const closure = new Promise<void>(resolve => { closed = resolve; });
  const url = await fixture(t, (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" }); res.write(Buffer.alloc(1024));
    const timer = setTimeout(() => res.write("x"), 10);
    res.on("close", () => { clearTimeout(timer); closed(); });
  });
  const result = await requestPinned(url, loopback, cap);
  assert.equal(result.truncated, true); assert.equal(result.body?.length, 1024);
  await closure;
});

for (const encoding of ["gzip", "deflate", "br"]) test(`decoded ${encoding} is bounded independently`, async t => {
  const compress = encoding === "gzip" ? gzipSync : encoding === "deflate" ? deflateSync : brotliCompressSync;
  const url = await fixture(t, (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html", "Content-Encoding": encoding });
    res.end(compress(Buffer.alloc(20000, 97)));
  });
  const result = await requestPinned(url, loopback, cap);
  assert.equal(result.body?.length, 1024); assert.equal(result.truncated, true);
});

test("unsupported MIME and redirect bodies stop at headers", async t => {
  for (const status of [200, 302]) {
    const url = await fixture(t, (_req, res) => {
      res.writeHead(status, { "Content-Type": status === 200 ? "application/pdf" : "text/html", Location: "/next" });
      res.flushHeaders(); // Intentionally never completes body.
    });
    const result = await requestPinned(url, loopback, cap);
    assert.equal(result.body, null); assert.equal(result.truncated, false);
  }
});

test("unknown compression and oversized headers fail closed", async t => {
  for (const headers of [{ "Content-Encoding": "unknown" }, { "X-Large": "x".repeat(40000) }]) {
    const url = await fixture(t, (_req, res) => { res.writeHead(200, { "Content-Type": "text/html", ...headers }); res.end("body"); });
    await assert.rejects(requestPinned(url, loopback, cap), /content_encoding_unsupported|Header overflow/);
  }
});

test("absolute deadline stops a slow trickle that defeats idle timeouts", async t => {
  const url = await fixture(t, (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" }); res.write("x");
    const timer = setInterval(() => res.write("x"), 10);
    res.on("close", () => clearInterval(timer));
  });
  await assert.rejects(requestPinned(url, loopback, { ...cap, timeoutMs: 100 }), /collector_timeout/);
});

test("cookies and authentication headers are never retained", async () => {
  const result = await collectPublicPage("https://example.test/", {
    lookupAll: publicAnswer,
    transport: async () => ({ ...await html(), headers: { "content-type": "text/html", "set-cookie": "session=secret", "www-authenticate": "secret", "x-private": "secret" } }),
  });
  assert.deepEqual(result.headers, { "content-type": "text/html" });
});

test("DNS timeout, empty answers and family mismatches fail before dispatch", async () => {
  for (const lookupAll of [async () => [], async () => [{ address: "8.8.8.8", family: 6 as const }], async (): Promise<never> => new Promise(() => {})]) {
    await assert.rejects(collectPublicPage("https://example.test/", { lookupAll, dnsTimeoutMs: 20, transport: async () => { assert.fail("dispatched"); } }), /private_destination|dns_timeout/);
  }
});

test("ordinary public IPv4 and IPv6 remain eligible", () => {
  for (const address of ["8.8.8.8", "1.1.1.1", "100.128.0.1", "172.32.0.1", "2606:4700:4700::1111", "2001:4860:4860::8888"]) assert.equal(isGlobalAddress(address), true, address);
});

test("redirect loops exhaust the hop ceiling", async () => {
  let calls = 0;
  await assert.rejects(collectPublicPage("https://example.test/", { lookupAll: publicAnswer, transport: async () => { calls++; return { ...await html(), status: 302, body: null, headers: { location: "/" } }; } }), /redirect_budget/);
  assert.equal(calls, 6);
});

import { resolveAddresses, type DnsRecords } from "../packages/perception/dns.js";

test("DNS alias recursion is bounded, cycles fail, and pending work is cancelled", async () => {
  for (const cyclic of [true, false]) {
    let calls = 0, cancelled = false;
    const resolver: DnsRecords = {
      resolveCname: async () => { calls++; return [cyclic ? "example.test" : `${calls}.example.test`]; },
      resolve4: async () => ["8.8.8.8"], resolve6: async () => [], cancel: () => { cancelled = true; },
    };
    await assert.rejects(resolveAddresses("example.test", 100, resolver), /dns_alias_limit/);
    assert.ok(calls <= 9); assert.equal(cancelled, true);
  }
});

test("DNS resolution retains all terminal and alias answers for validation", async () => {
  const resolver: DnsRecords = {
    resolveCname: async name => name === "example.test" ? ["target.test"] : [],
    resolve4: async name => [name === "example.test" ? "8.8.8.8" : "127.0.0.1"],
    resolve6: async () => [], cancel: () => {},
  };
  const answers = await resolveAddresses("example.test", 100, resolver);
  await assert.rejects(collectPublicPage("https://example.test/", { lookupAll: async () => answers, transport: html }), /private_destination/);
});

test("encoded controls, backslashes and explicit actions are rejected", async () => {
  for (const suffix of ["/%5clogout", "/%00", "/%0a", "/?action=publish", "/?action=update", "/?action="]) {
    await assert.rejects(collectPublicPage(`https://example.test${suffix}`, { lookupAll: publicAnswer, transport: html }), /url_invalid|action_like/);
  }
});

test("successful decompression preserves exact bytes and MIME parameters", async t => {
  const expected = Buffer.from("<html>business</html>");
  const url = await fixture(t, (_req, res) => { res.writeHead(200, { "Content-Type": "Text/HTML; charset=utf-8", "Content-Encoding": "gzip" }); res.end(gzipSync(expected)); });
  const result = await requestPinned(url, loopback, cap);
  assert.deepEqual(result.body, expected); assert.equal(result.truncated, false);
});

test("interrupted bodies and invalid compressed bytes cannot become successful evidence", async t => {
  const invalid = await fixture(t, (_req, res) => { res.writeHead(200, { "Content-Type": "text/html", "Content-Encoding": "gzip" }); res.end("not gzip"); });
  await assert.rejects(requestPinned(invalid, loopback, cap));
  const interrupted = await fixture(t, (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html", "Content-Length": "100" }); res.write("short");
    setTimeout(() => res.destroy(), 10);
  });
  await assert.rejects(requestPinned(interrupted, loopback, cap), /collector_interrupted|aborted/);
});

import { createServer as createTlsServer } from "node:https";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("TLS remains verified when pinned and self-signed destinations are rejected", async t => {
  const dir = mkdtempSync(join(tmpdir(), "aios-collector-tls-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "1", "-subj", "/CN=fixture.invalid"], { stdio: "ignore" });
  let dispatched = false;
  const server = createTlsServer({ key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) }, (_req, res) => { dispatched = true; res.end("unsafe"); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  await assert.rejects(requestPinned(new URL(`https://fixture.invalid:${address.port}/`), loopback, cap), /self.signed certificate/);
  assert.equal(dispatched, false);
});

test("ambient proxies cannot redirect a pinned request", async t => {
  const names = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NODE_USE_ENV_PROXY"];
  const old = names.map(name => process.env[name]);
  names.forEach(name => { process.env[name] = name === "NODE_USE_ENV_PROXY" ? "1" : "http://127.0.0.1:1"; });
  t.after(() => names.forEach((name, i) => { if (old[i] === undefined) delete process.env[name]; else process.env[name] = old[i]; }));
  const url = await fixture(t, (_req, res) => { res.writeHead(200, { "Content-Type": "text/xml" }); res.end("<sitemap/>"); });
  assert.equal((await requestPinned(url, loopback, cap)).body?.toString(), "<sitemap/>");
});

import { collectPublicHop } from "../packages/perception/collector.js";

test("one-hop collection leaves redirects to separately governed dispatch", async () => {
  let calls = 0;
  const result = await collectPublicHop('https://example.test/start', {
    lookupAll: publicAnswer,
    transport: async () => { calls++; return {status:302,headers:{location:'/next'},body:null,truncated:false}; },
  });
  assert.equal(calls,1);assert.equal(result.nextUrl,'https://example.test/next');
  assert.equal(result.finalUrl,'https://example.test/start');assert.deepEqual(result.redirects,[]);
});
