import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRobots, robotsAllows } from "../packages/perception/robots.js";

const allowed = (text: string, path: string, agent = "AIOSSEOResearchBot/0.1") => robotsAllows(parseRobots(text), `https://example.test${path}`, agent);

test("consecutive user agents share rules and matching groups combine", () => {
  const text = "User-agent: AIOSSEOResearchBot\nUser-agent: OtherBot\nDisallow: /private\nUser-agent: aiosseoresearchbot\nDisallow: /second";
  assert.equal(allowed(text, "/private"), false);
  assert.equal(allowed(text, "/second"), false);
  assert.equal(allowed(text, "/private", "OtherBot/1"), false);
});
test("specific product token suppresses wildcard even for an empty group", () => {
  const text = "User-agent: *\nDisallow: /\nUser-agent: AIOSSEOResearchBot\nAllow: /public";
  assert.equal(allowed(text, "/other"), true);
  assert.equal(allowed(text, "/public", "AnotherBot"), false);
  assert.equal(allowed("User-agent: *\nDisallow: /\nUser-agent: AIOSSEOResearchBot", "/other"), true);
  assert.equal(allowed("User-agent: ResearchBot\nDisallow: /", "/"), true);
});
test("comments, CR newlines, empty rules and sitemap extensions preserve groups", () => {
  const text = "\uFEFFUser-Agent: AIOSSEOResearchBot\rSitemap: https://example.test/sitemap.xml\rUser-agent: OtherBot\rDisallow: /private # comment\rAllow: /private/open\rDisallow:   # empty";
  assert.equal(allowed(text, "/private"), false);
  assert.equal(allowed(text, "/private/open"), true);
  assert.deepEqual(parseRobots(text).sitemaps, ["https://example.test/sitemap.xml"]);
});
test("wildcards and end anchors include query but exclude URL fragment", () => {
  const text = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /search?private=*\nAllow: /search?private=public$";
  assert.equal(allowed(text, "/guide.pdf#part"), false);
  assert.equal(allowed(text, "/guide.pdf?download=1"), true);
  assert.equal(allowed(text, "/search?private=secret"), false);
  assert.equal(allowed(text, "/search?private=public"), true);
  assert.equal(allowed("User-agent: *\nDisallow: /a*b$", "/abxxb"), false);
  assert.equal(allowed("User-agent: *\nDisallow: /a*", "/a"), false);
  assert.equal(allowed("User-agent: *\nDisallow: /a$", "/abc"), true);
});
test("longest octet match wins and equivalent allow wins regardless of order", () => {
  assert.equal(allowed("User-agent: *\nDisallow: /foo\nAllow: /foo\nDisallow: /foo/bar", "/foo"), true);
  assert.equal(allowed("User-agent: *\nAllow: /foo\nDisallow: /foo/bar", "/foo/bar"), false);
  assert.equal(allowed("User-agent: *\nDisallow: /%62ar\nAllow: /bar", "/bar"), true);
  assert.equal(allowed("User-agent: *\nDisallow: /é*\nAllow: /*ab", "/éab"), true);
});
test("UTF8 and percent octets compare consistently without decoding reserved slash", () => {
  const text = "User-agent: *\nDisallow: /café\nDisallow: /foo/%62ar\nDisallow: /a%2fb\nDisallow: /literal%2A\nDisallow: /money%24";
  for (const path of ["/caf%C3%A9", "/café", "/foo/bar", "/foo/%62%61r", "/a%2Fb", "/literal*", "/money$"]) assert.equal(allowed(text, path), false, path);
  assert.equal(allowed(text, "/a/b"), true);
  assert.equal(allowed(text, "/literalXYZ"), true);
  assert.equal(allowed("User-agent: *\nDisallow: /Case", "/case"), true);
});
test("ungrouped rules are ignored and robots bootstrap remains available", () => {
  assert.equal(allowed("Disallow: /\nUser-agent: OtherBot\nDisallow: /", "/"), true);
  assert.equal(allowed("User-agent: *\nDisallow: /", "/robots.txt"), true);
});
test("malformed rules and binary or oversized documents fail closed", () => {
  for (const text of ["User-agent: *\nDisallow: relative", "User-agent:\nDisallow: /", "User-agent: *\nDisallow: /bad%xx", "User-agent: *\nDisallow: /a\u0000b", "<html>not robots</html>", "User-agent: *\nDisallow: /\uD800"]) assert.throws(() => parseRobots(text), /robots_invalid/);
  assert.throws(() => parseRobots("#" + "x".repeat(512000)), /robots_oversize/);
  assert.throws(() => parseRobots(Buffer.from([0xc0, 0xaf])), /robots_invalid_utf8/);
  assert.equal(robotsAllows(parseRobots(Buffer.from("User-agent: *\nDisallow: /")), "https://example.test/x"), false);
});
test("many repeated agent lines cannot multiply a shared group's work", () => {
  const parsed = parseRobots("User-agent: AIOSSEOResearchBot\n".repeat(1000) + "Disallow: /private\n".repeat(1000));
  assert.equal(parsed.rules.length, 1);
  assert.equal(robotsAllows(parsed, "https://example.test/private"), false);
});

import { robotsState, pageAllowed } from "../packages/perception/robots-admission.js";

test("robots status matrix treats unavailable policy as unknown and never grants page admission", () => {
  for (const status of [301, 401, 403, 429, 500, 503]) {
    const state = robotsState({ status, body: Buffer.from('User-agent: *\nAllow: /'), truncated: false });
    assert.equal(pageAllowed(state, 'https://example.test/'), false);
  }
  for (const status of [404, 410]) assert.equal(pageAllowed(robotsState({status, body: null, truncated: false}), 'https://example.test/'), true);
  for (const receipt of [null, {status: 200, body: Buffer.from('User-agent: *\nAllow: /'), truncated: true}, {status: 200, body: Buffer.from('<html>error</html>'), truncated: false}, {status: 200, body: null, truncated: false}]) assert.equal(pageAllowed(robotsState(receipt), 'https://example.test/'), false);
  const known = robotsState({status: 200, body: Buffer.from('User-agent: *\nDisallow: /private'), truncated: false});
  assert.equal(pageAllowed(known, 'https://example.test/private'), false);
  assert.equal(pageAllowed(known, 'https://example.test/public'), true);
});
