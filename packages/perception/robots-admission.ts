import { parseRobots, robotsAllows, type RobotsDocument } from "./robots.js";
import type { CollectorReceipt } from "./collector.js";

export type RobotsState =
  | { state: "known"; document: RobotsDocument; reason: "parsed" | "not_available" }
  | { state: "denied" | "unknown"; document: null; reason: string };

export function robotsState(receipt: Pick<CollectorReceipt, "status" | "body" | "truncated"> | null): RobotsState {
  if (!receipt) return { state: "unknown", document: null, reason: "transport_failed" };
  if ([401,403].includes(receipt.status)) return { state: "denied", document: null, reason: "access_denied" };
  if ([404,410].includes(receipt.status)) return { state: "known", document: parseRobots(""), reason: "not_available" };
  if (receipt.status < 200 || receipt.status >= 300 || receipt.truncated || receipt.body === null) return { state: "unknown", document: null, reason: "unavailable_or_incomplete" };
  try { return { state: "known", document: parseRobots(receipt.body), reason: "parsed" }; }
  catch { return { state: "unknown", document: null, reason: "parse_failed" }; }
}
export function pageAllowed(state: RobotsState, url: string): boolean {
  return state.state === "known" && robotsAllows(state.document, url);
}
