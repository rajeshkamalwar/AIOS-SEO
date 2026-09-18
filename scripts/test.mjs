import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
const compiledHttp = process.argv.includes("--compiled-http");
if (process.argv.slice(2).length > 1 || process.argv.slice(2).some(arg => !["--http-seed", "--compiled-http-seed", "--http-seed-docker", "--http-projection", "--compiled-http-projection", "--http-projection-docker", "--http-acceptance", "--compiled-http-acceptance", "--http-acceptance-docker", "--http-bootstrap", "--compiled-http-bootstrap", "--fixture-retention", "--compiled-fixture-retention", "--http-isolated", "--compiled-http-isolated", "--http-isolated-docker", "--render-projection", "--compiled-render-projection", "--render-projection-docker", "--render-acceptance-docker", "--render-acceptance", "--compiled-render-acceptance", "--compiled-http", "--render-source", "--compiled-render-source", "--compiled-render-lane", "--render-execution", "--compiled-render-execution"].includes(arg))) throw new Error("Unknown or combined test mode");
const httpSeedDocker=process.argv.includes("--http-seed-docker");
const httpSeed=process.argv.includes("--http-seed")||httpSeedDocker;
const compiledHttpSeed=process.argv.includes("--compiled-http-seed");
const httpProjectionDocker=process.argv.includes("--http-projection-docker");
const httpProjection=process.argv.includes("--http-projection")||httpProjectionDocker;
const compiledHttpProjection=process.argv.includes("--compiled-http-projection");
const httpAcceptanceDocker=process.argv.includes("--http-acceptance-docker");
const httpAcceptance=process.argv.includes("--http-acceptance")||httpAcceptanceDocker;
const compiledHttpAcceptance=process.argv.includes("--compiled-http-acceptance");
const httpBootstrap=process.argv.includes("--http-bootstrap");
const compiledHttpBootstrap=process.argv.includes("--compiled-http-bootstrap");
const fixtureRetention=process.argv.includes("--fixture-retention");
const compiledFixtureRetention=process.argv.includes("--compiled-fixture-retention");
const httpIsolatedDocker=process.argv.includes("--http-isolated-docker");
const httpIsolated=process.argv.includes("--http-isolated")||httpIsolatedDocker;
const compiledHttpIsolated=process.argv.includes("--compiled-http-isolated");
const renderProjectionDocker = process.argv.includes("--render-projection-docker");
const renderProjection = process.argv.includes("--render-projection") || renderProjectionDocker;
const compiledRenderProjection = process.argv.includes("--compiled-render-projection");
const renderAcceptanceDocker = process.argv.includes("--render-acceptance-docker");
const renderAcceptance = process.argv.includes("--render-acceptance") || renderAcceptanceDocker;
const compiledRenderAcceptance = process.argv.includes("--compiled-render-acceptance");
const renderExecution = process.argv.includes("--render-execution");
const compiledRenderExecution = process.argv.includes("--compiled-render-execution");
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
      ...(compiledHttpSeed || compiledHttpProjection || compiledHttpAcceptance || compiledHttpBootstrap || compiledFixtureRetention || compiledHttpIsolated || compiledRenderProjection || compiledRenderAcceptance || compiledRenderSource || compiledRenderLane || compiledRenderExecution ? [] : ["--import", "tsx"]),
      "--test",
      "--test-concurrency=1",
      ...(compiledHttpSeed ? ["dist/tests/foundation.test.js", "dist/tests/http-bootstrap-seed.test.js"] : httpSeed ? ["tests/foundation.test.ts", "tests/http-bootstrap-seed.test.ts"] : compiledHttpProjection ? ["dist/tests/foundation.test.js", "dist/tests/http-bootstrap-projection.test.js"] : httpProjection ? ["tests/foundation.test.ts", "tests/http-bootstrap-projection.test.ts"] : compiledHttpAcceptance ? ["dist/tests/foundation.test.js", "dist/tests/http-acceptance.test.js"] : httpAcceptance ? ["tests/foundation.test.ts", "tests/http-acceptance.test.ts"] : compiledHttpBootstrap ? ["dist/tests/foundation.test.js", "dist/tests/http-bootstrap.test.js", "dist/tests/http-isolated.test.js", "dist/tests/http-fixture-broker.test.js", "dist/tests/http-fixture-engine.test.js"] : httpBootstrap ? ["tests/foundation.test.ts", "tests/http-bootstrap.test.ts", "tests/http-isolated.test.ts", "tests/http-fixture-broker.test.ts", "tests/http-fixture-engine.test.ts"] : compiledFixtureRetention ? ["dist/tests/foundation.test.js", "dist/tests/http-evidence.test.js", "dist/tests/reviewed-fixtures.test.js", "dist/tests/offline-render-source.test.js", "dist/tests/site-scope.test.js"] : fixtureRetention ? ["tests/foundation.test.ts", "tests/http-evidence.test.ts", "tests/reviewed-fixtures.test.ts", "tests/offline-render-source.test.ts", "tests/site-scope.test.ts"] : compiledHttpIsolated ? ["dist/tests/foundation.test.js", "dist/tests/http-isolated.test.js", "dist/tests/http-fixture-broker.test.js", "dist/tests/http-fixture-engine.test.js"] : httpIsolated ? ["tests/foundation.test.ts", "tests/http-isolated.test.ts", "tests/http-fixture-broker.test.ts", "tests/http-fixture-engine.test.ts"] : compiledRenderProjection ? ["dist/tests/foundation.test.js", "dist/tests/render-projection.test.js"] : renderProjection ? ["tests/foundation.test.ts", "tests/render-projection.test.ts"] : compiledRenderAcceptance ? ["dist/tests/foundation.test.js", "dist/tests/render-acceptance.test.js"] : renderAcceptance ? ["tests/foundation.test.ts", "tests/render-acceptance.test.ts"] : compiledRenderExecution ? ["dist/tests/foundation.test.js", "dist/tests/render-execution.test.js"] : renderExecution ? ["tests/foundation.test.ts", "tests/render-execution.test.ts"] : compiledRenderLane ? ["dist/tests/foundation.test.js", "dist/tests/render-lane.test.js"] : compiledRenderSource ? ["dist/tests/foundation.test.js", "dist/tests/offline-render-source.test.js"] : renderSource ? ["tests/foundation.test.ts", "tests/offline-render-source.test.ts"] : [
      "tests/policy.test.ts",
      "tests/contracts.test.ts",
      "tests/blob.test.ts",
      "tests/foundation.test.ts",
      "tests/http-evidence.test.ts",
      "tests/reviewed-fixtures.test.ts",
      "tests/jobs.test.ts",
      "tests/http-lane.test.ts",
      "tests/http-isolated.test.ts",
      "tests/http-bootstrap.test.ts",
      "tests/http-acceptance.test.ts",
      "tests/http-bootstrap-projection.test.ts",
      "tests/http-bootstrap-seed.test.ts",
      "tests/http-fixture-broker.test.ts",
      "tests/http-fixture-engine.test.ts",
      "tests/render-lane.test.ts",
      "tests/render-execution.test.ts",
      "tests/render-acceptance.test.ts",
      "tests/render-projection.test.ts",
      "tests/render-privacy.test.ts",
      "tests/render-retention.test.ts",
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
        AIOS_TEST_HTTP_SEED: httpSeedDocker ? "1" : "0",
        AIOS_TEST_HTTP_PROJECTION: httpProjectionDocker ? "1" : "0",
        AIOS_TEST_HTTP_ACCEPTANCE: httpAcceptanceDocker ? "1" : "0",
        AIOS_TEST_HTTP_ISOLATED: httpIsolatedDocker ? "1" : "0",
        AIOS_TEST_RENDER_PROJECTION: renderProjectionDocker ? "1" : "0",
        AIOS_TEST_RENDER_ACCEPTANCE: renderAcceptanceDocker ? "1" : "0",
        AIOS_TEST_RENDER_EXECUTION: renderExecution ? "1" : "0",
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
  if (result.status === 0 && !httpSeed && !compiledHttpSeed && !httpProjection && !compiledHttpProjection && !httpAcceptance && !compiledHttpAcceptance && !httpBootstrap && !compiledHttpBootstrap && !fixtureRetention && !compiledFixtureRetention && !httpIsolated && !compiledHttpIsolated && !compiledHttp && !renderSource && !compiledRenderSource && !compiledRenderLane && !renderExecution && !compiledRenderExecution && !renderAcceptance && !compiledRenderAcceptance && !renderProjection && !compiledRenderProjection) {
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
