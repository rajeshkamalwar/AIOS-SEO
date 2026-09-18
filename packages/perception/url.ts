import { createHash } from "node:crypto";
import { isIP } from "node:net";

const forbidden = /(^|\/)(logout|delete|remove|unsubscribe|checkout|cart|wp-admin|admin|login|account)(\/|$)/i;
// Known credential spellings, including common presigned URLs. This is an
// admission guard, not a claim that arbitrary query values contain no secrets.
const secretQuery = /^(token|key|secret|password|auth|signature|session|accesstoken|refreshtoken|idtoken|apikey|clientsecret|authorization|xamzcredential|xamzsignature|xamzsecuritytoken|xgoogcredential|xgoogsignature|sig)$/;
const queryKey = (key: string) => key.split("[", 1)[0]!.replace(/[-_]/g, "").toLowerCase();
export type UrlDecision = { url: string; key: string; excluded?: string };
export function normalizeUrl(raw: string, origin?: string): UrlDecision {
  if (raw.length > 4096 || /[{}<>\u0000-\u0020\u007f\\]/.test(raw)) throw new Error("url_invalid");
  let u: URL;
  try { u = new URL(raw, origin); } catch { throw new Error("url_invalid"); }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || u.port) throw new Error("url_forbidden");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host.startsWith("[") || isIP(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("url_forbidden");
  u.hash = "";
  for (const [k] of u.searchParams) if (secretQuery.test(queryKey(k))) throw new Error("url_credential_query");
  let path: string;
  try { path = decodeURIComponent(u.pathname); } catch { throw new Error("url_invalid"); }
  if (/[\u0000-\u001f\u007f\\]/.test(path)) throw new Error("url_invalid");
  const value = u.toString();
  if (forbidden.test(path) || [...u.searchParams.keys()].some(k => queryKey(k) === "action")) return { url: value, key: value, excluded: "action_like" };
  return { url: value, key: createHash("sha256").update(value).digest("hex") };
}
