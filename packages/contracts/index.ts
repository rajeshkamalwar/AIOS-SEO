import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import formats from "ajv-formats";
import { createHash } from "node:crypto";

export const base = "https://schemas.aios-seo.invalid/v1/";
const root = fileURLToPath(new URL("../../spec/", import.meta.url));
export const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  coerceTypes: false,
  removeAdditional: false,
  useDefaults: false,
});
// Schema dialect is explicit. strict:false permits conditional subschemas without repeated type keywords.
formats.default(ajv);
for (const name of readdirSync(root).filter((n) =>
  n.endsWith(".schema.json"),
)) {
  ajv.addSchema(JSON.parse(readFileSync(root + name, "utf8")));
}
export function validate(id: string, value: unknown): void {
  const check = ajv.getSchema(id);
  if (!check || !check(value)) throw new Error("schema_invalid");
}
export function uuid(value: unknown): asserts value is string {
  validate(base + "common.schema.json#/$defs/id", value);
}
export function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const object = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(object)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(object[k]))
        .join(",") +
      "}"
    );
  }
  throw new Error("invalid_manifest_value");
}
export function manifestHash(value: unknown): string {
  return hash(Buffer.from(canonical(value)));
}
