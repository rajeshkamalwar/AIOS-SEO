import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
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
    [
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=1",
      "tests/policy.test.ts",
      "tests/contracts.test.ts",
      "tests/blob.test.ts",
      "tests/foundation.test.ts",
      "tests/http-evidence.test.ts",
      "tests/jobs.test.ts",
      "tests/http-lane.test.ts",
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
      "tests/render-manifest.test.ts",
      "tests/understanding.test.ts",
      "tests/api.test.ts",
      "tests/runtime.test.ts",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
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
  if (result.status === 0) {
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
