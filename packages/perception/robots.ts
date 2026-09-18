import { readFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(new URL("../../spec/discovery-policy.json", import.meta.url), "utf8"));
export type RobotsRule = { agent: string; allow: string[]; disallow: string[] };
export type RobotsDocument = { rules: RobotsRule[]; sitemaps: string[] };

// RFC 9309 §§2.2–2.2.4. AIOS additionally treats malformed directives/bytes
// as unknown policy: the caller must stop admission, not interpret them as Allow.
// https://www.rfc-editor.org/rfc/rfc9309.html
export function parseRobots(input: string | Uint8Array, _agent = policy.user_agent): RobotsDocument {
  if (Buffer.byteLength(input) > policy.robots_bytes) throw new Error("robots_oversize");
  let text: string;
  try { text = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input); }
  catch { throw new Error("robots_invalid_utf8"); }
  if (Buffer.from(text).toString("utf8") !== text || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error("robots_invalid_bytes");
  const rules: RobotsRule[] = [], sitemaps: string[] = [];
  let agents: string[] = [], allow: string[] = [], disallow: string[] = [], hasRules = false;
  // Share completed group arrays; copying per agent makes bounded input expand
  // quadratically. New groups replace these arrays rather than mutate them.
  const flush = () => { for (const agent of new Set(agents)) rules.push({ agent, allow, disallow }); };
  for (const source of text.replace(/^\uFEFF/, "").split(/\r\n|[\r\n]/)) {
    const line = source.split("#", 1)[0]!.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error("robots_invalid_line");
    const key = line.slice(0, separator).trim().toLowerCase(), value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!/^(\*|[a-z_-]+)$/i.test(value)) throw new Error("robots_invalid_agent");
      if (hasRules) { flush(); agents = []; allow = []; disallow = []; hasRules = false; }
      agents.push(value.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      if (!agents.length) continue;
      hasRules = true;
      if (!value) continue;
      if (!value.startsWith("/") || /\s/.test(value)) throw new Error("robots_invalid_path");
      normalizeOctets(value, true); // Reject malformed percent sequences now.
      (key === "allow" ? allow : disallow).push(value);
    } else if (key === "sitemap" && value) sitemaps.push(value);
  }
  flush();
  return { rules, sitemaps };
}

// One JS character per compared octet. Encoded reserved bytes stay distinct
// from path separators; percent-unreserved and literal ASCII compare equally.
function normalizeOctets(input: string, pattern: boolean): string {
  let result = "";
  for (let i = 0; i < input.length;) {
    const char = input[i]!;
    if (char === "%") {
      const hex = input.slice(i + 1, i + 3);
      if (!/^[a-f0-9]{2}$/i.test(hex)) throw new Error("robots_invalid_percent");
      const byte = Number.parseInt(hex, 16), decoded = String.fromCharCode(byte);
      result += /^[a-z0-9._~-]$/i.test(decoded) ? decoded : String.fromCharCode(256 + byte);
      i += 3;
    } else {
      const point = input.codePointAt(i)!;
      if (point > 127) for (const byte of Buffer.from(String.fromCodePoint(point))) result += String.fromCharCode(256 + byte);
      else if (char === "$" || (char === "*" && !pattern)) result += String.fromCharCode(256 + point);
      else result += char;
      i += point > 65535 ? 2 : 1;
    }
  }
  return result;
}

function match(pattern: string, target: string): number {
  const anchored = pattern.endsWith("$");
  const normalized = normalizeOctets(anchored ? pattern.slice(0, -1) : pattern, true);
  const parts = normalized.split("*");
  const first = parts[0]!;
  if (!target.startsWith(first)) return -1;
  let offset = first.length;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    // The final anchored segment must end at the URI end, not its first match.
    const position = anchored && i === parts.length - 1 ? target.length - part.length : target.indexOf(part, offset);
    if (position < offset || !target.startsWith(part, position)) return -1;
    offset = position + part.length;
  }
  if (anchored && offset !== target.length) return -1;
  return parts.reduce((length, part) => length + part.length, 0);
}

export function robotsAllows(parsed: RobotsDocument, rawUrl: string, agent = policy.user_agent): boolean {
  const product = agent.split("/", 1)[0]!.toLowerCase();
  if (!/^[a-z_-]+$/.test(product)) throw new Error("robots_invalid_agent");
  if (rawUrl.length > 4096) throw new Error("robots_invalid_url");
  const url = new URL(rawUrl);
  if (url.pathname === "/robots.txt" && !url.search) return true;
  const specific = parsed.rules.filter(rule => rule.agent === product);
  const selected = specific.length ? specific : parsed.rules.filter(rule => rule.agent === "*");
  const path = normalizeOctets(url.pathname + url.search, false);
  let allow = -1, deny = -1;
  for (const rule of selected) {
    for (const pattern of rule.allow) allow = Math.max(allow, match(pattern, path));
    for (const pattern of rule.disallow) deny = Math.max(deny, match(pattern, path));
  }
  return allow >= deny;
}
