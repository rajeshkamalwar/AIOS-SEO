import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixtures, normalizeUrl, parseRobots, robotsAllows, parseSitemap, Frontier, renderLocal } from "../packages/perception/index.js";

await loadFixtures();
test("URL identity preserves query order and blocks credentials/action paths", () => {
  assert.equal(normalizeUrl("https://orange.example/a?b=2&a=1#x").url, "https://orange.example/a?b=2&a=1");
  assert.throws(() => normalizeUrl("https://orange.example/a?token=x"), /credential/);
  assert.equal(normalizeUrl("https://orange.example/logout").excluded, "action_like");
  assert.throws(() => normalizeUrl("http://127.0.0.1/"), /forbidden/);
});
test("robots uses longest allow/disallow match and preserves sitemap declarations", () => {
  const parsed=parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/public\nSitemap: https://orange.example/sitemap.xml");
  assert.equal(robotsAllows(parsed,"https://orange.example/private"),false);
  assert.equal(robotsAllows(parsed,"https://orange.example/private/public"),true);
  assert.deepEqual(parsed.sitemaps,["https://orange.example/sitemap.xml"]);
});
test("sitemap rejects entity expansion and excludes off-origin members", () => {
  assert.deepEqual(parseSitemap("<urlset><url><loc>https://orange.example/</loc></url><url><loc>https://evil.example/x</loc></url></urlset>","https://orange.example/").urls,["https://orange.example/"]);
  assert.throws(() => parseSitemap("<!DOCTYPE x [<!ENTITY y SYSTEM 'file:///etc/passwd'>]>","https://orange.example/"), /invalid/);
});
test("frontier is bounded, unique and deterministic", () => {
  const f=new Frontier(); f.add("https://orange.example/","submitted",0,0); f.add("https://orange.example/#x","link",1,4); assert.deepEqual(f.admit(),["https://orange.example/"]); assert.equal(f.snapshot().discovered,1);
});
test("renderer is fail-closed without an isolated worker", () => { assert.deepEqual(renderLocal(),{state:"disabled",evidence_id:null,reason:"isolated_renderer_required",browser_build:null}); });
test("egress rejects IPv6 unspecified and private destinations", async () => { const { assertPublicDestination } = await import("../packages/perception/index.js"); await assert.rejects(assertPublicDestination("localhost"), /private_destination|ENOTFOUND/); });
