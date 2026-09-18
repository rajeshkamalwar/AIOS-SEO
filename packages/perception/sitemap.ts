import sax from "sax";
import { normalizeUrl } from "./url.js";

export type SitemapResult = {
  kind: "urlset" | "sitemapindex" | "text";
  urls: string[]; links: string[]; sitemaps: string[];
  excluded: { invalid: number; action: number; outOfScope: number; budget: number };
};
export function parseSitemap(input: string | Uint8Array, origin: string): SitemapResult {
  let text: string;
  try { text = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input); } catch { throw new Error("sitemap_invalid"); }
  if (Buffer.byteLength(text) > 5242880 || Buffer.from(text).toString("utf8") !== text || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("sitemap_invalid");
  const site = new URL(normalizeUrl(origin).url).origin;
  const result: SitemapResult = { kind: "text", urls: [], links: [], sitemaps: [], excluded: { invalid: 0, action: 0, outOfScope: 0, budget: 0 } };
  const seen = new Set<string>();
  const accept = (value: string) => {
    let d;
    try {
      // A sitemap loc is absolute; silently resolving a malformed declaration is not evidence.
      if (!/^https?:\/\//i.test(value)) throw new Error("absolute_required");
      d = normalizeUrl(value);
    } catch { result.excluded.invalid++; return; }
    if (d.excluded) { result.excluded.action++; return; }
    if (seen.has(d.url)) return;
    if (seen.size >= 5000) { result.excluded.budget++; return; }
    seen.add(d.url);
    if (new URL(d.url).origin !== site) { result.excluded.outOfScope++; result.links.push(d.url); }
    else if (result.kind === "sitemapindex") result.sitemaps.push(d.url);
    else result.urls.push(d.url);
  };
  if (!text.trimStart().startsWith("<")) {
    for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) if (line.trim()) accept(line.trim());
    return result;
  }
  const options = { xmlns: true, strictEntities: true };
  const parser = sax.parser(true, options);
  const stack: { local: string; uri: string }[] = [];
  let roots = 0, value = "", collecting = false;
  const invalid = () => { throw new Error("sitemap_invalid"); };
  parser.onerror = invalid; parser.ondoctype = invalid; parser.onsgmldeclaration = invalid;
  parser.onopentag = tag => {
    const node = tag as sax.QualifiedTag;
    if (stack.length === 0) {
      roots++;
      if (roots !== 1 || !["urlset", "sitemapindex"].includes(node.local) || !["", "http://www.sitemaps.org/schemas/sitemap/0.9"].includes(node.uri)) invalid();
      result.kind = node.local as "urlset" | "sitemapindex";
    }
    if (collecting || stack.length >= 32) invalid();
    stack.push({ local: node.local, uri: node.uri });
    const root = stack[0]!;
    if (stack.length === 3 && stack[1]!.local === (result.kind === "urlset" ? "url" : "sitemap") && stack[1]!.uri === root.uri && node.local === "loc" && node.uri === root.uri) { value = ""; collecting = true; }
  };
  const content = (text: string) => {
    if (collecting) { value += text; if (value.length > 4096) invalid(); }
    else if (stack.length === 0 && text.trim()) invalid();
  };
  parser.ontext = content; parser.oncdata = content;
  parser.onclosetag = () => { if (collecting && stack.length === 3) { accept(value.trim()); collecting = false; } stack.pop(); };
  try { parser.write(text).close(); } catch { invalid(); }
  if (roots !== 1 || stack.length) invalid();
  return result;
}

// Pure admission for index traversal; the dispatcher owns fetching and persistence.
export class SitemapDocuments {
  private seen = new Set<string>();
  constructor(private origin: string) { this.origin = new URL(normalizeUrl(origin).url).origin; }
  admit(raw: string, depth: number): boolean {
    if (!Number.isSafeInteger(depth) || depth < 0 || depth > 2 || this.seen.size >= 20) return false;
    const d = normalizeUrl(raw);
    if (d.excluded || new URL(d.url).origin !== this.origin || this.seen.has(d.url)) return false;
    this.seen.add(d.url); return true;
  }
  get count(): number { return this.seen.size; }
}
