// Offline synthetic replay, not a network tool or production discovery handler.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

const maxBytes = 5 * 1024 * 1024;
let browser;
const result = {
  profile: 'local-offline-replay-v3', url: null, inputSha256: null, browserBuild: null,
  state: 'failed', samples: [], deniedCount: 0, deniedRequests: [], sandbox: null,
};
let limited = false, halted = false, budgetExceeded = false;
function denied(url, method, resourceType, reason) {
  if (halted) return;
  limited = true;
  result.deniedCount++;
  // Bounded fixture diagnostics only; never a raw production logging interface.
  if (result.deniedRequests.length < 100)
    result.deniedRequests.push({ url: String(url).slice(0, 4096), method, resourceType, reason, observedAt: new Date().toISOString() });
  // The initial fixture document consumes attempt one. No further request is dispatched.
  if (result.deniedCount >= 99) {
    budgetExceeded = true; halted = true;
    void browser?.close().catch(() => {});
  }
}
function assertRunning() {
  if (halted) throw new Error(budgetExceeded ? 'attempt_budget_exhausted' : 'timeout');
}
function assertIsolation() {
  if (process.platform !== 'linux' || process.getuid() === 0) throw new Error('linux_nonroot_required');
  const status = readFileSync('/proc/self/status', 'utf8');
  for (const pattern of [/^CapEff:\s+0+$/m, /^NoNewPrivs:\s+1$/m, /^Seccomp:\s+2$/m])
    if (!pattern.test(status)) throw new Error('container_isolation_required');
  if (Object.entries(networkInterfaces()).some(([name, addresses]) => name !== 'lo' && addresses?.length))
    throw new Error('offline_network_namespace_required');
}
async function input() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > maxBytes + 65536) throw new Error('input_limit');
    chunks.push(chunk);
  }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  if (!value || Object.keys(value).sort().join(',') !== 'html,url' ||
      typeof value.html !== 'string' || Buffer.byteLength(value.html) > maxBytes ||
      typeof value.url !== 'string' || value.url.length > 4096) throw new Error('invalid_fixture');
  // JSON escape syntax can carry lone UTF-16 surrogates. Never silently replace
  // those code units when computing a digest or fulfilling the fixture body.
  const htmlBytes = Buffer.from(value.html, 'utf8');
  if (htmlBytes.toString('utf8') !== value.html || Buffer.from(value.url, 'utf8').toString('utf8') !== value.url)
    throw new Error('invalid_fixture');
  const url = new URL(value.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.example') || url.username || url.password || url.port || url.hash)
    throw new Error('synthetic_scope_required');
  return { url: url.href, htmlBytes, inputSha256: createHash('sha256').update(htmlBytes).digest('hex') };
}
async function render(value) {
  assertIsolation();
  browser = await chromium.launch({ headless: true, channel: 'chromium', chromiumSandbox: true,
    args: ['--disable-background-networking'], timeout: 10000 });
  if (halted) { await browser.close(); throw new Error('timeout'); }
  result.browserBuild = browser.version();
  const diagnostic = await browser.newPage();
  await diagnostic.goto('chrome://sandbox');
  const status = await diagnostic.locator('body').innerText();
  const checks = { namespace: /Layer 1 Sandbox\s+Namespace/.test(status), pid: /PID namespaces\s+Yes/.test(status),
    network: /Network namespaces\s+Yes/.test(status), seccomp: /Seccomp-BPF sandbox\s+Yes/.test(status) };
  if (!Object.values(checks).every(Boolean)) throw new Error('browser_sandbox_required');
  result.sandbox = checks;
  await diagnostic.close();
  assertRunning();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US',
    serviceWorkers: 'block', acceptDownloads: false, permissions: [], userAgent: 'AIOSSEOResearchBot/0.1' });
  // Count context HTTP request objects whose request event has been observed but
  // requestfinished/requestfailed has not. Includes the fulfilled fixture and
  // pending aborted requests; sockets are separate denied diagnostics, not HTTP.
  const pendingRequests = new Set();
  context.on('request', request => pendingRequests.add(request));
  context.on('requestfinished', request => pendingRequests.delete(request));
  context.on('requestfailed', request => pendingRequests.delete(request));
  let initial = true; let page;
  await context.routeWebSocket('**/*', socket => {
    denied(socket.url(), 'GET', 'websocket', 'offline_policy'); socket.close();
  });
  await context.route('**/*', async route => {
    const request = route.request();
    if (initial && request.url() === value.url && request.method() === 'GET' && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      initial = false;
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: value.htmlBytes });
    } else {
      denied(request.url(), request.method(), request.resourceType(), 'offline_policy');
      await route.abort('blockedbyclient');
    }
  });
  page = await context.newPage();
  context.on('page', other => {
    if (other !== page) { denied(other.url(), 'GET', 'popup', 'offline_policy'); void other.close().catch(() => {}); }
  });
  page.on('download', download => { denied(download.url(), 'GET', 'download', 'offline_policy'); void download.cancel(); });
  page.on('dialog', dialog => void dialog.dismiss());
  assertRunning();
  await page.goto(value.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  assertRunning();
  const start = performance.now();
  for (const offsetMs of [0, 2000, 5000]) {
    while (performance.now() - start < offsetMs)
      await new Promise(resolve => setTimeout(resolve, Math.max(1, offsetMs - (performance.now() - start))));
    assertRunning();
    if (page.url() !== value.url) { denied(page.url(), 'GET', 'navigation', 'context_changed'); break; }
    const dom = await page.content();
    assertRunning();
    if (page.url() !== value.url) { denied(page.url(), 'GET', 'navigation', 'context_changed'); break; }
    if (Buffer.byteLength(dom) > maxBytes) { limited = true; break; }
    result.samples.push({ offsetMs, actualOffsetMs: Math.round(performance.now() - start),
      observedAt: new Date().toISOString(), pendingRequests: pendingRequests.size, dom });
  }
  assertRunning();
  result.state = limited ? 'policy_limited' : 'captured';
}
let deadline;
try {
  // Includes stdin admission; the supervisor also kills the entire container on timeout.
  await Promise.race([(async () => { const value = await input(); result.url = value.url; result.inputSha256 = value.inputSha256; await render(value); })(),
    new Promise((_, reject) => { deadline = setTimeout(() => { halted = true; reject(new Error('timeout')); }, 20000); })]);
} catch (error) {
  result.state = budgetExceeded ? 'policy_limited' : error?.message === 'timeout' ? 'timeout' : 'failed';
  result.error = budgetExceeded ? 'attempt_budget_exhausted' : error?.message === 'timeout' ? 'timeout' : 'render_failed';
} finally {
  clearTimeout(deadline);
  process.stdin.destroy();
  await Promise.race([browser?.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 2000).unref())]);
}
// A terminal receipt ends this one-shot container, including late asynchronous setup.
process.stdout.write(JSON.stringify(result) + '\n', () => process.exit(0));
