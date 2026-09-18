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
      "tests/jobs.test.ts",
      "tests/perception.test.ts",
      "tests/collector.test.ts",
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
} finally {
  if (started)
    spawnSync(
      command("pg_ctl"),
      ["-D", data, "-m", "immediate", "-w", "stop"],
      { stdio: "pipe" },
    );
  rmSync(root, { recursive: true, force: true });
}
