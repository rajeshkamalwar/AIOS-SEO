import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSitemap } from "../packages/perception/index.js";

test("XML entities are decoded and only structural sitemap locations become targets", () => {
  const result = parseSitemap('<urlset><url><loc>https://example.test/a?x=1&amp;y=2</loc><image><loc>https://example.test/image</loc></image></url></urlset>', 'https://example.test/');
  assert.deepEqual(result.urls, ['https://example.test/a?x=1&y=2']);
});
test("text sitemaps preserve query order and deduplicate targets", () => {
  assert.deepEqual(parseSitemap('https://example.test/a?b=2&a=1\nhttps://example.test/a?b=2&a=1\n', 'https://example.test/').urls, ['https://example.test/a?b=2&a=1']);
});
test("malformed XML never yields apparently valid partial discovery", () => {
  for (const text of ['<urlset><url><loc>https://example.test/</loc>', '<urlset/><urlset/>', '<html><loc>https://example.test/</loc></html>', '<urlset><url><loc>&unknown;</loc></url></urlset>']) assert.throws(() => parseSitemap(text, 'https://example.test/'), /sitemap_invalid/);
});

import { SitemapDocuments } from "../packages/perception/sitemap.js";

test("sitemap indexes declare child documents, never page targets", () => {
  const result = parseSitemap('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://example.test/child.xml</loc></sitemap></sitemapindex>', 'https://example.test/');
  assert.equal(result.kind, 'sitemapindex'); assert.deepEqual(result.urls, []);
  assert.deepEqual(result.sitemaps, ['https://example.test/child.xml']);
});
test("unsafe and out-of-scope locations remain explicit exclusions", () => {
  const result = parseSitemap('https://example.test/a\nhttps://example.test/?token=secret\nhttps://example.test/logout\nhttps://other.test/a\n/relative', 'https://example.test/');
  assert.deepEqual(result.urls, ['https://example.test/a']);
  assert.deepEqual(result.excluded, { invalid: 2, action: 1, outOfScope: 1, budget: 0 });
  assert.ok(!JSON.stringify(result).includes('secret'));
});
test("DTD, invalid UTF8, unknown namespaces, oversized and deeply nested XML fail closed", () => {
  for (const text of ['<!DOCTYPE urlset><urlset/>', '<urlset xmlns="https://evil.test/"/>', '<urlset>' + '<x>'.repeat(40) + '</x>'.repeat(40) + '</urlset>', 'x'.repeat(5242881), '\ud800']) assert.throws(() => parseSitemap(text, 'https://example.test/'), /sitemap_invalid/);
  assert.throws(() => parseSitemap(Buffer.from([0xff]), 'https://example.test/'), /sitemap_invalid/);
});
test("discovery limits preserve explicit sampling and traversal avoids loops", () => {
  const result = parseSitemap(Array.from({length:5001}, (_,i) => `https://example.test/${i}`).join('\n'), 'https://example.test/');
  assert.equal(result.urls.length, 5000); assert.equal(result.excluded.budget, 1);
  const docs = new SitemapDocuments('https://example.test/');
  assert.equal(docs.admit('https://other.test/sitemap.xml', 0), false);
  assert.equal(docs.admit('https://example.test/deep.xml', 3), false);
  for (let i=0; i<20; i++) assert.equal(docs.admit(`https://example.test/${i}.xml`, i % 3), true);
  assert.equal(docs.admit('https://example.test/extra.xml', 0), false);
  assert.equal(docs.admit('https://example.test/0.xml', 0), false); assert.equal(docs.count, 20);
});
