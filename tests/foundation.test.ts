import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { LocalBlobs } from "../packages/evidence/index.js";
import {
  Ledger,
  sweepOrphans,
  type Principal,
  type Capture,
} from "../packages/persistence/index.js";
import { migrate } from "../packages/persistence/migrate.js";
import { base, validate, hash } from "../packages/contracts/index.js";
const socket = process.env.AIOS_TEST_SOCKET;
if (!socket)
  throw new Error("Run npm test with the disposable cluster harness");
const config = { host: socket, port: 55439, database: "postgres" };
const admin = new pg.Pool({ ...config, user: "aios_test_owner" });
admin.on("error", () => {});
let pool: pg.Pool, ledger: Ledger, blobs: LocalBlobs;
let a: Principal,
  b: Principal,
  viewer: Principal,
  revoked: Principal,
  sa: string,
  sb: string;
const body = await readFile("spec/fixtures/home.html");
const capture = (): Capture => ({
  attemptId: randomUUID(),
  sourceUri: "https://orange.example/",
  capturedAt: new Date(Date.now() - 1000).toISOString(),
  mimeType: "text/html",
  contextHash: hash(Buffer.from("synthetic-http-context")),
});
const fixtureRecord = async (
  type: string,
  changes: Record<string, unknown>,
) => {
  const file = JSON.parse(
    await readFile("spec/examples/" + type.toLowerCase() + ".json", "utf8"),
  );
  const row = { ...file, ...changes };
  validate(base + "domain.schema.json#/$defs/" + type, row);
  const table = (
    { Tenant: "tenant", User: "app_user", Membership: "membership" } as Record<
      string,
      string
    >
  )[type];
  const entries = Object.entries(row).filter(
    ([k]) => !["provenance_ids", "site_scope_ids"].includes(k),
  );
  await admin.query(
    `INSERT INTO aios.${table} (${entries.map(([k]) => k).join(",")}) VALUES (${entries.map((_, i) => "$" + (i + 1)).join(",")})`,
    entries.map(([, v]) => v),
  );
};
async function person(
  tenantId: string,
  role: string,
  state = "active",
): Promise<Principal> {
  const userId = randomUUID();
  await fixtureRecord("User", { id: userId, subject: userId });
  await fixtureRecord("Membership", {
    id: randomUUID(),
    tenant_id: tenantId,
    user_id: userId,
    role,
    state,
  });
  return { tenantId, userId };
}
async function scopedSQL(
  p: Principal,
  fn: (c: pg.PoolClient) => Promise<void>,
) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL search_path=aios,pg_catalog");
    await c.query(
      "SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",
      [p.tenantId, p.userId],
    );
    await fn(c);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
before(async () => {
  await admin.query(
    "CREATE ROLE aios_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE",
  );
  await migrate(admin);
  const ta = randomUUID(),
    tb = randomUUID();
  await fixtureRecord("Tenant", { id: ta });
  await fixtureRecord("Tenant", { id: tb });
  a = await person(ta, "owner");
  b = await person(tb, "owner");
  viewer = await person(ta, "viewer");
  revoked = await person(ta, "editor", "revoked");
  blobs = await LocalBlobs.create(
    join(process.env.AIOS_TEST_ROOT!, "blobs"),
    "local-synthetic-v1",
  );
  pool = new pg.Pool({ ...config, user: "aios_runtime", max: 2 });
  pool.on("error", () => {});
  ledger = new Ledger(pool, blobs, "local-synthetic-v1");
  sa = await ledger.registerSite(a, "https://orange.example/");
  sb = await ledger.registerSite(b, "https://orange.example/");
});
after(async () => {
  await pool?.end();
  await admin.end();
});
test("M1.1 migrations are repeatable and runtime cannot own or bypass isolation", async () => {
  await migrate(admin);
  const roles = await pool.query(
    "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
  );
  assert.equal(roles.rows[0].rolsuper, false);
  assert.equal(roles.rows[0].rolbypassrls, false);
  const tables = await admin.query(
    "SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='aios' AND relkind='r'",
  );
  assert.ok(tables.rows.length >= 15);
  for (const r of tables.rows) {
    assert.ok(r.relrowsecurity && r.relforcerowsecurity, r.relname);
    assert.notEqual(r.owner, "aios_runtime");
  }
  await assert.rejects(
    pool.query("CREATE TABLE aios.escape(id integer)"),
    /permission denied/,
  );
});
test("M1.2 independent identities, missing scope, foreign reads/references and pool reuse", async () => {
  assert.notEqual(sa, sb);
  const x = await ledger.accept(a, sa, capture(), body);
  await assert.rejects(ledger.artifact(b, sb, x.evidenceId), /not_found/);
  await assert.rejects(ledger.accept(b, sa, capture(), body), /scope_denied/);
  await scopedSQL(b, async (c) => {
    assert.equal(
      (await c.query("SELECT * FROM evidence WHERE id=$1", [x.evidenceId]))
        .rowCount,
      0,
    );
  });
  await assert.rejects(
    scopedSQL(b, async (c) => {
      await c.query(
        "INSERT INTO record_link VALUES($1,$2,'provenance_ids',0,$3,'Evidence')",
        [b.tenantId, sb, x.evidenceId],
      );
    }),
  );
  const c = await pool.connect();
  try {
    assert.equal((await c.query("SELECT * FROM aios.evidence")).rowCount, 0);
    assert.equal(
      (
        await c.query(
          "SELECT nullif(current_setting('app.tenant_id',true),'') AS tenant",
        )
      ).rows[0].tenant,
      null,
    );
  } finally {
    c.release();
  }
});
test("M1.2 viewer and revoked membership cannot collect; non-fixture activation fails closed", async () => {
  await assert.rejects(
    ledger.accept(viewer, sa, capture(), body),
    /scope_denied/,
  );
  await assert.rejects(
    ledger.accept(revoked, sa, capture(), body),
    /scope_denied/,
  );
  await assert.rejects(
    ledger.registerSite(a, "https://example.com/"),
    /policy_blocked/,
  );
  assert.throws(() => new Ledger(pool, blobs, "production"), /policy_blocked/);
});
test("M1.3 actual bytes, digest and rollback on event failure, with safe orphan cleanup", async () => {
  const x = await ledger.accept(a, sa, capture(), body);
  assert.deepEqual(await ledger.artifact(a, sa, x.evidenceId), body);
  const before = await admin.query("SELECT count(*) FROM aios.evidence");
  await admin.query(
    "CREATE FUNCTION aios.reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected_failure'; END $$; CREATE TRIGGER injected BEFORE INSERT ON aios.outbox FOR EACH ROW EXECUTE FUNCTION aios.reject_event()",
  );
  try {
    await assert.rejects(
      ledger.accept(a, sa, capture(), body),
      /injected_failure/,
    );
  } finally {
    await admin.query(
      "DROP TRIGGER injected ON aios.outbox; DROP FUNCTION aios.reject_event()",
    );
  }
  assert.equal(
    (await admin.query("SELECT count(*) FROM aios.evidence")).rows[0].count,
    before.rows[0].count,
  );
  assert.ok((await sweepOrphans(admin, blobs)) >= 1);
  assert.deepEqual(await ledger.artifact(a, sa, x.evidenceId), body);
});
test("M1.4 same attempt is idempotent; changed payload conflicts; distinct attempt appends", async () => {
  const c = capture();
  const [x, y] = await Promise.all([
    ledger.accept(a, sa, c, body),
    ledger.accept(a, sa, c, body),
  ]);
  assert.deepEqual(x, y);
  await assert.rejects(
    ledger.accept(a, sa, c, Buffer.from("changed")),
    /conflict/,
  );
  const z = await ledger.accept(a, sa, capture(), body);
  assert.notEqual(z.evidenceId, x.evidenceId);
  const events = await admin.query(
    "SELECT count(*) FROM aios.outbox WHERE payload->>'correlation_id'=$1",
    [c.attemptId],
  );
  assert.equal(events.rows[0].count, "1");
  await assert.rejects(
    scopedSQL(a, (c) =>
      c
        .query("UPDATE evidence SET sha256=$1 WHERE id=$2", [
          "0".repeat(64),
          x.evidenceId,
        ])
        .then(() => {}),
    ),
    /permission denied|immutable/,
  );
  await assert.rejects(
    admin.query("UPDATE aios.observation SET sensor_id=$1 WHERE id=$2", [
      "forged",
      x.observationId,
    ]),
    /immutable_record/,
  );
});
test("M1.5 frozen bundles reject late and foreign inputs and preserve prior knowledge", async () => {
  const x = await ledger.accept(a, sa, capture(), body);
  const cut = await ledger.cutoff(a, sa);
  const y = await ledger.accept(
    a,
    sa,
    capture(),
    Buffer.from("later correction"),
  );
  await assert.rejects(
    ledger.freeze(a, sa, cut, [y.evidenceId], [y.observationId]),
    /invalid_bundle_reference/,
  );
  const id = await ledger.freeze(a, sa, cut, [x.evidenceId], [x.observationId]);
  const bundle = await ledger.bundle(a, sa, id);
  assert.deepEqual(bundle.evidence_ids, [x.evidenceId]);
  assert.equal(bundle.known_seq, cut.known_seq);
  await assert.rejects(
    ledger.observation(a, sa, y.observationId, cut),
    /not_found/,
  );
  await assert.rejects(ledger.bundle(b, sb, id), /not_found/);
  await assert.rejects(
    admin.query("UPDATE aios.evidence_bundle SET known_seq=999 WHERE id=$1", [
      id,
    ]),
    /immutable_record/,
  );
});
test("M1.5 concurrent acceptance cannot cross an already returned cutoff", async () => {
  const cut = await ledger.cutoff(a, sa);
  const receipt = await ledger.accept(a, sa, capture(), body);
  const row = await ledger.observation(a, sa, receipt.observationId);
  assert.ok(Number(row.knowledge_seq) > cut.known_seq);
  await assert.rejects(
    ledger.freeze(
      a,
      sa,
      { ...cut, known_at: "2000-01-01T00:00:00Z" },
      [receipt.evidenceId],
      [],
    ),
    /invalid_cutoff/,
  );
});
test("M1.6 duplicated delivery has one atomic inbox and projection effect", async () => {
  await ledger.accept(a, sa, capture(), body);
  const events = await ledger.pending(a, sa);
  const event = events[0]!;
  validate(base + "event.schema.json", event);
  assert.equal(await ledger.deliver(a, sa, String(event.event_id)), true);
  assert.equal(await ledger.deliver(a, sa, String(event.event_id)), false);
  const count = await admin.query(
    "SELECT count(*) FROM aios.evidence_projection WHERE event_id=$1",
    [event.event_id],
  );
  assert.equal(count.rows[0].count, "1");
});
test("M1.6 database process crash/restart retains bytes and pending outbox", async () => {
  const x = await ledger.accept(a, sa, capture(), body);
  const pendingBefore = (await ledger.pending(a, sa)).map((x) => x.event_id);
  await pool.end();
  await admin.query("SELECT 1");
  const bin = process.env.AIOS_TEST_PG_BIN!;
  const data = process.env.AIOS_TEST_DATA!;
  // Only the harness-created cluster is addressed. Never restart an existing user service.
  assert.ok(data.startsWith("/tmp/aios-m1-"));
  execFileSync(
    join(bin, "pg_ctl"),
    [
      "-D",
      data,
      "-l",
      join(process.env.AIOS_TEST_ROOT!, "postgres.log"),
      "-m",
      "immediate",
      "-w",
      "restart",
    ],
    { stdio: "pipe" },
  );
  pool = new pg.Pool({ ...config, user: "aios_runtime", max: 2 });
  pool.on("error", () => {});
  ledger = new Ledger(pool, blobs, "local-synthetic-v1");
  assert.deepEqual(await ledger.artifact(a, sa, x.evidenceId), body);
  assert.deepEqual(
    (await ledger.pending(a, sa)).map((x) => x.event_id),
    pendingBefore,
  );
});
test("M1.2 site-limited membership and same-tenant cross-site references are denied", async () => {
  const other = await ledger.registerSite(a, "https://second.example/");
  const scoped = await person(a.tenantId, "expert");
  const m = await admin.query(
    "SELECT id FROM aios.membership WHERE user_id=$1",
    [scoped.userId],
  );
  const grantClient = await admin.connect();
  await grantClient.query("BEGIN");
  try {
    await grantClient.query(
      "INSERT INTO aios.record_link VALUES($1,$2,'site_scope_ids',0,$3,'Site')",
      [a.tenantId, m.rows[0].id, sa],
    );
    await grantClient.query(
      "UPDATE aios.membership SET all_sites=false WHERE id=$1",
      [m.rows[0].id],
    );
    await grantClient.query("COMMIT");
  } catch (e) {
    await grantClient.query("ROLLBACK");
    throw e;
  } finally {
    grantClient.release();
  }
  const x = await ledger.accept(a, sa, capture(), body);
  assert.deepEqual(await ledger.artifact(scoped, sa, x.evidenceId), body);
  await assert.rejects(ledger.cutoff(scoped, other), /scope_denied/);
  await assert.rejects(
    scopedSQL(a, (c) =>
      c
        .query(
          "INSERT INTO record_link VALUES($1,$2,'provenance_ids',0,$3,'Evidence')",
          [a.tenantId, other, x.evidenceId],
        )
        .then(() => {}),
    ),
    /scope_denied/,
  );
});
test("M1.4 frozen reference sets cannot acquire new evidence after creation", async () => {
  const x = await ledger.accept(a, sa, capture(), body);
  const k = await ledger.cutoff(a, sa);
  const id = await ledger.freeze(a, sa, k, [x.evidenceId], [x.observationId]);
  const y = await ledger.accept(a, sa, capture(), body);
  await assert.rejects(
    scopedSQL(a, (c) =>
      c
        .query(
          "INSERT INTO record_link VALUES($1,$2,'evidence_ids',1,$3,'Evidence')",
          [a.tenantId, id, y.evidenceId],
        )
        .then(() => {}),
    ),
    /immutable_reference_set/,
  );
});
test("M1.5 concurrent capture and cutoff assign ordered committed knowledge", async () => {
  const [x, k, y] = await Promise.all([
    ledger.accept(a, sa, capture(), body),
    ledger.cutoff(a, sa),
    ledger.accept(a, sa, capture(), body),
  ]);
  const rows = await Promise.all([
    ledger.observation(a, sa, x.observationId),
    ledger.observation(a, sa, y.observationId),
  ]);
  assert.notEqual(rows[0]!.knowledge_seq, rows[1]!.knowledge_seq);
  for (const row of rows) {
    if (Number(row.knowledge_seq) > k.known_seq)
      await assert.rejects(
        ledger.observation(a, sa, String(row.id), k),
        /not_found/,
      );
    else
      assert.equal(
        (await ledger.observation(a, sa, String(row.id), k)).id,
        row.id,
      );
  }
});
test("M1.6 consumer failure rolls back inbox and effect together", async () => {
  await ledger.accept(a, sa, capture(), body);
  const event = (await ledger.pending(a, sa))[0]!;
  await admin.query(
    "CREATE FUNCTION aios.reject_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected_projection_failure'; END $$; CREATE TRIGGER injected BEFORE INSERT ON aios.evidence_projection FOR EACH ROW EXECUTE FUNCTION aios.reject_projection()",
  );
  try {
    await assert.rejects(
      ledger.deliver(a, sa, String(event.event_id)),
      /injected_projection_failure/,
    );
  } finally {
    await admin.query(
      "DROP TRIGGER injected ON aios.evidence_projection; DROP FUNCTION aios.reject_projection()",
    );
  }
  assert.equal(
    (
      await admin.query("SELECT count(*) FROM aios.inbox WHERE event_id=$1", [
        event.event_id,
      ])
    ).rows[0].count,
    "0",
  );
  assert.equal(await ledger.deliver(a, sa, String(event.event_id)), true);
});

test("M1.2 runtime cannot create phantom identities or broaden membership scope", async () => {
  const membership = await admin.query(
    "SELECT id FROM aios.membership WHERE user_id=$1",
    [viewer.userId],
  );
  await assert.rejects(
    scopedSQL(viewer, (c) =>
      c
        .query(
          "INSERT INTO record_link VALUES($1,$2,'site_scope_ids',0,$3,'Site')",
          [viewer.tenantId, membership.rows[0].id, sa],
        )
        .then(() => {}),
    ),
    /scope_denied/,
  );
  await assert.rejects(
    scopedSQL(a, (c) =>
      c
        .query(
          "INSERT INTO record_index(tenant_id,id,record_type,site_id) VALUES($1,$2,'Evidence',$3)",
          [a.tenantId, randomUUID(), sa],
        )
        .then(() => {}),
    ),
    /permission denied/,
  );
});
