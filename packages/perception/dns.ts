import { Resolver } from "node:dns/promises";
import type { Address } from "./transport.js";

export interface DnsRecords {
  resolveCname(host: string): Promise<string[]>;
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
  cancel(): void;
}
async function optional(query: Promise<string[]>): Promise<string[]> {
  try { return await query; } catch (error) {
    if (["ENODATA", "ENOTFOUND"].includes((error as NodeJS.ErrnoException).code ?? "")) return [];
    throw error;
  }
}
// Resolve the full alias chain with an explicit bound, not a second DNS lookup
// during connection establishment. Timeout cancels the resolver's pending I/O.
export async function resolveAddresses(host: string, timeout: number, resolver: DnsRecords = new Resolver({ timeout, tries: 1 })): Promise<Address[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const seen = new Set<string>();
  const addresses: Address[] = [];
  const walk = async (name: string, depth: number): Promise<void> => {
    name = name.toLowerCase().replace(/\.$/, "");
    if (depth > 8 || seen.has(name)) throw new Error("dns_alias_limit");
    seen.add(name);
    const [aliases, v4, v6] = await Promise.all([optional(resolver.resolveCname(name)), optional(resolver.resolve4(name)), optional(resolver.resolve6(name))]);
    if (aliases.length > 1) throw new Error("dns_alias_limit");
    addresses.push(...v4.map(address => ({ address, family: 4 as const })), ...v6.map(address => ({ address, family: 6 as const })));
    if (addresses.length > 64) throw new Error("dns_answer_limit");
    for (const alias of aliases) await walk(alias, depth + 1);
  };
  try {
    await Promise.race([walk(host, 0), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Error("dns_timeout")); resolver.cancel(); }, timeout);
    })]);
    return addresses;
  } finally { clearTimeout(timer); resolver.cancel(); }
}
