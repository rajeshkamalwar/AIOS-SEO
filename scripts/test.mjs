import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
const compiledHttp = process.argv.includes("--compiled-http");
if (process.argv.slice(2).length > 1 || process.argv.slice(2).some(arg => !["--compiled-http", "--render-source", "--compiled-render-source", "--compiled-render-lane"].includes(arg))) throw new Error("Unknown or combined test mode");
const compiledRenderLane = process.argv.includes("--compiled-render-lane");
const renderSource = process.argv.includes("--render-source");
const compiledRenderSource = process.argv.includes("--compiled-render-source");
const pg =
  process.env.PG_BIN ??
  (existsSync("/opt/homebrew/opt/postgresql@17/bin/postgres")
    ? "/opt/homebrew/opt/postgresql@17/bin"
    : "");
const command = (name) => (pg ? join(pg, name) : name);
if (
  !execFileSync(command("postgres"), ["--version"], {
    encoding: "utf8",
  }).includes(" 17.")
)
  throw new Error("Set PG_BIN to PostgreSQL 17 binaries");
const root = mkdtempSync("/tmp/aios-m1-");
const data = join(root, "db"),
  socket = join(root, "socket");
mkdirSync(socket, { mode: 0o700 });
let started = false;
try {
  execFileSync(
    command("initdb"),
    [
      "-D",
      data,
      "-A",
      "trust",
      "-U",
      "aios_test_owner",
      "--no-locale",
      "-E",
      "UTF8",
    ],
    { stdio: "pipe" },
  );
  execFileSync(
    command("pg_ctl"),
    [
      "-D",
      data,
      "-l",
      join(root, "postgres.log"),
      "-o",
      `-k ${socket} -h '' -p 55439`,
      "-w",
      "start",
    ],
    { stdio: "pipe" },
  );
  started = true;
  const result = spawnSync(
    process.execPath,
    compiledHttp ? ["--test", "--test-concurrency=1", "dist/tests/foundation.test.js", "dist/tests/http-lane.test.js"] : [
      ...(compiledRenderSource || compiledRenderLane ? [] : ["--import", "tsx"]),
      "--test",
      "--test-concurrency=1",
      ...(compiledRenderLane ? ["dist/tests/foundation.test.js", "dist/tests/render-lane.test.js"] : compiledRenderSource ? ["dist/tests/foundation.test.js", "dist/tests/offline-render-source.test.js"] : renderSource ? ["tests/foundation.test.ts", "tests/offline-render-source.test.ts"] : [
      "tests/policy.test.ts",
      "tests/contracts.test.ts",
      "tests/blob.test.ts",
      "tests/foundation.test.ts",
      "tests/http-evidence.test.ts",
      "tests/jobs.test.ts",
      "tests/http-lane.test.ts",
      "tests/render-lane.test.ts",
      "tests/perception-persistence.test.ts",
      "tests/site-scope.test.ts",
      "tests/render-persistence.test.ts",
      "tests/frontier-persistence.test.ts",
      "tests/sitemap-index-persistence.test.ts",
      "tests/frontier-links.test.ts",
      "tests/input-eligibility.test.ts",
      "tests/perception.test.ts",
      "tests/robots.test.ts",
      "tests/sitemap.test.ts",
      "tests/collector.test.ts",
      "tests/decoding.test.ts",
      "tests/dom.test.ts",
      "tests/dom-isolated.test.ts",
      "tests/render-result.test.ts",
      "tests/render-input.test.ts",
      "tests/offline-render-source.test.ts",
      "tests/render-manifest.test.ts",
      "tests/understanding.test.ts",
      "tests/api.test.ts",
      "tests/runtime.test.ts",
      ]),
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        AIOS_TEST_RENDER_SOURCE: renderSource ? "1" : "0",
        AIOS_TEST_SOCKET: socket,
        AIOS_TEST_DATA: data,
        AIOS_TEST_PG_BIN: pg,
        AIOS_TEST_ROOT: root,
      },
    },
  );
  process.exitCode = result.status ?? 1;
  // This integration suite sorts before foundation.test.ts, which creates the
  // cluster runtime role. Run it after foundation in the same disposable DB.
  if (result.status === 0 && !compiledHttp && !renderSource && !compiledRenderSource && !compiledRenderLane) {
    const scoped = spawnSync(process.execPath, ["--import", "tsx", "--test", "tests/api-scope.test.ts"], {
      stdio: "inherit",
      env: { ...process.env, AIOS_TEST_SOCKET: socket, AIOS_TEST_DATA: data, AIOS_TEST_PG_BIN: pg, AIOS_TEST_ROOT: root },
    });
    process.exitCode = scoped.status ?? 1;
  }
} finally {
  if (started)
    spawnSync(
      command("pg_ctl"),
      ["-D", data, "-m", "immediate", "-w", "stop"],
      { stdio: "pipe" },
    );
  rmSync(root, { recursive: true, force: true });
}
