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

export { parseRobots, robotsAllows } from "./robots.js";
export { parseSitemap, SitemapDocuments } from "./sitemap.js";

export class Frontier {
  private discovered = new Map<string, { url: string; depth: number; seed: string; priority: number }>();
  private admitted = new Set<string>();
  private variants = new Map<string, Set<string>>();
  private origin: string | undefined;
  add(raw: string, seed: string, depth: number, priority: number): UrlDecision {
    if (!Number.isSafeInteger(depth) || depth < 0 || !Number.isSafeInteger(priority) || priority < 0 || priority > 4 || !seed) throw new Error("frontier_input");
    const d = normalizeUrl(raw); if (d.excluded) return d;
    const url = new URL(d.url);
    if (this.origin && this.origin !== url.origin) return { ...d, excluded: "out_of_scope" };
    // Equality is the full normalized URL, never the hash accelerator alone.
    if (this.discovered.has(d.url)) return d;
    if (depth > policy.max_depth || this.discovered.size >= policy.discovered_urls) return { ...d, excluded: "budget" };
    const variants = this.variants.get(url.pathname) ?? new Set<string>();
    if (variants.size >= 20 && !variants.has(url.search)) return { ...d, excluded: "query_variants" };
    this.origin ??= url.origin;
    variants.add(url.search); this.variants.set(url.pathname, variants);
    this.discovered.set(d.url, { url: d.url, depth, seed, priority });
    return d;
  }
  admit(): string[] {
    const values = [...this.discovered.values()].filter(x => !this.admitted.has(x.url)).sort((a,b) => a.priority-b.priority || a.depth-b.depth || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
    for (const x of values.slice(0, policy.admitted_urls - this.admitted.size)) this.admitted.add(x.url);
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
export { collectPublicPage, collectPublicHop } from "./collector.js";
