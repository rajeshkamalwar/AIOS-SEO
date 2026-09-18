import assert from "node:assert/strict";
import { test } from "node:test";
import { collectPublicPage } from "../packages/perception/collector.js";

test("collector pins the resolved public address and retains supported HTML", async () => {
  const seen: string[] = [];
  const result = await collectPublicPage("https://example.test/", {
    lookupAll: async host => { seen.push(host); return [{ address: "93.184.216.34", family: 4 }]; },
    transport: async (_url, address) => { assert.equal(address.address, "93.184.216.34"); return { status: 200, headers: { "content-type": "text/html" }, body: Buffer.from("<html>ok</html>"), truncated: false }; },
  });
  assert.deepEqual(seen, ["example.test"]);
  assert.equal(result.body?.toString(), "<html>ok</html>");
});

test("collector rejects a private answer before opening a connection", async () => {
  await assert.rejects(() => collectPublicPage("https://example.test/", { lookupAll: async () => [{ address: "127.0.0.1", family: 4 }] }), /private_destination/);
});
