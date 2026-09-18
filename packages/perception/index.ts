import { createHash } from "node:crypto";
import { resolveAddresses } from "./dns.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validate, base, hash } from "../contracts/index.js";

const policy = JSON.parse(await readFile(new URL("../../spec/discovery-policy.json", import.meta.url), "utf8"));
export { normalizeUrl } from "./url.js";
import { normalizeUrl, type UrlDecision } from "./url.js";
import { isGlobalAddress } from "./address.js";

export async function assertPublicDestination(hostname: string): Promise<void> {
  const results = await resolveAddresses(hostname, 3000);
  if (!results.length || results.some(({ address }) => !isGlobalAddress(address))) throw new Error("private_destination");
}

type Rule = { agent: string; allow: string[]; disallow: string[] };
export function parseRobots(text: string, agent = policy.user_agent): { rules: Rule[]; sitemaps: string[] } {
  if (Buffer.byteLength(text) > policy.robots_bytes) throw new Error("robots_oversize");
  const rules: Rule[] = []; const sitemaps: string[] = []; let current: Rule | null = null;
  for (const line of text.split(/\r?\n/)) {
    const [rawKey, ...rest] = line.split(":"); if (!rawKey) continue;
    const key = rawKey.trim().toLowerCase(), value = rest.join(":").trim();
    if (key === "user-agent") { current = { agent: value.toLowerCase(), allow: [], disallow: [] }; rules.push(current); }
    else if (key === "allow" && current && value) current.allow.push(value);
    else if (key === "disallow" && current && value) current.disallow.push(value);
    else if (key === "sitemap" && value) sitemaps.push(value);
  }
  return { rules, sitemaps };
}
export function robotsAllows(parsed: ReturnType<typeof parseRobots>, url: string, agent = policy.user_agent): boolean {
  const path = new URL(url).pathname || "/";
  const groups = parsed.rules.filter(r => r.agent === "*" || agent.toLowerCase().includes(r.agent));
  if (!groups.length) return true;
  const allow = groups.flatMap(g => g.allow).filter(x => path.startsWith(x)).sort((a,b) => b.length-a.length)[0] ?? "";
  const deny = groups.flatMap(g => g.disallow).filter(x => path.startsWith(x)).sort((a,b) => b.length-a.length)[0] ?? "";
  return allow.length >= deny.length;
}

export function parseSitemap(text: string, origin: string): { urls: string[]; links: string[] } {
  if (Buffer.byteLength(text) > 5 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("sitemap_invalid");
  const urls: string[] = [], links: string[] = [];
  for (const m of text.matchAll(/<loc\s*>([\s\S]*?)<\/loc\s*>/gi)) {
    const loc = (m[1] ?? "").trim(); const decision = normalizeUrl(loc, origin);
    if (decision.excluded) continue;
    if (new URL(decision.url).origin === new URL(origin).origin) urls.push(decision.url);
    else links.push(decision.url);
  }
  return { urls: [...new Set(urls)].slice(0, 5000), links: [...new Set(links)] };
}

export class Frontier {
  private discovered = new Map<string, { url: string; depth: number; seed: string; priority: number; reason?: string }>();
  private admitted = new Set<string>();
  add(raw: string, seed: string, depth: number, priority: number): UrlDecision {
    const d = normalizeUrl(raw); if (d.excluded) return d;
    if (depth > policy.max_depth || this.discovered.size >= policy.discovered_urls) return { ...d, excluded: "budget" };
    if (!this.discovered.has(d.key)) this.discovered.set(d.key, { url: d.url, depth, seed, priority });
    return d;
  }
  admit(): string[] {
    const values = [...this.discovered.values()].sort((a,b) => a.priority-b.priority || a.depth-b.depth || a.url.localeCompare(b.url));
    for (const x of values.slice(0, policy.admitted_urls)) this.admitted.add(x.url);
    return [...this.admitted];
  }
  snapshot() { return { discovered: this.discovered.size, admitted: this.admitted.size, urls: [...this.admitted] }; }
}

export function fixtureBody(path: string): Buffer {
  if (!/^([a-z0-9-]+)\.(html|txt|xml)$/.test(path)) throw new Error("fixture_path");
  return Buffer.from(requireFixture(path));
}
function requireFixture(path: string): string {
  const known = new Set(["home.html","services.html","contact.html","robots.txt","robots-deny.txt","sitemap.xml","bad-sitemap.xml","injection.html","spa-raw.html","spa-rendered.html","catalog.html","publisher.html","hybrid.html"]);
  if (!known.has(path)) throw new Error("fixture_missing");
  return fixtureCache[path] ?? "";
}
const fixtureCache: Record<string,string> = {};
export async function loadFixtures(root = new URL("../../spec/fixtures/", import.meta.url)): Promise<void> {
  for (const name of ["home.html","services.html","contact.html","robots.txt","robots-deny.txt","sitemap.xml","bad-sitemap.xml","injection.html","spa-raw.html","spa-rendered.html","catalog.html","publisher.html","hybrid.html"]) fixtureCache[name] = await readFile(new URL(name, root), "utf8");
}

export type RenderResult = { state: "disabled" | "failed"; evidence_id: null; reason: string; browser_build: null };
export function renderLocal(): RenderResult { return { state: "disabled", evidence_id: null, reason: "isolated_renderer_required", browser_build: null }; }

export function receipt(input: unknown): unknown { validate(base + "http-receipt.schema.json", input); return input; }
export const limits = Object.freeze(policy);
export const digest = (bytes: Uint8Array) => hash(bytes);
export { collectPublicPage } from "./collector.js";
