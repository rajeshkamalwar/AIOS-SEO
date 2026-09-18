import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { base, validate, manifestHash } from "../packages/contracts/index.js";
const index = JSON.parse(readFileSync("spec/examples/index.json", "utf8"));
for (const c of index.examples)
  test(c.path, () => {
    const value = JSON.parse(readFileSync("spec/" + c.path, "utf8"));
    if (c.valid) validate(c.schema, value);
    else assert.throws(() => validate(c.schema, value), /schema_invalid/);
  });
test("schema validator never turns missingness into zero or coerces numbers", () => {
  assert.throws(() =>
    validate(base + "common.schema.json#/$defs/unknown", {
      status: "unknown",
      reason: "not_connected",
      evidence_ids: [],
      value: 0,
    }),
  );
  assert.equal(manifestHash({ b: 2, a: 1 }), manifestHash({ a: 1, b: 2 }));
  assert.throws(() => manifestHash({ x: NaN }));
});
