import type { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { hash } from "../contracts/index.js";

/** Run with a dedicated migration owner; runtime roles cannot run DDL. */
export async function migrate(pool: Pool): Promise<void> {
  const sql = await readFile(
    new URL("./migrations/001-evidence-ledger.sql", import.meta.url),
    "utf8",
  );
  const digest = hash(Buffer.from(sql));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const version = await c.query("SHOW server_version_num");
    if (Math.floor(Number(version.rows[0].server_version_num) / 10000) !== 17)
      throw new Error("PostgreSQL 17 required");
    await c.query("SELECT pg_advisory_xact_lock(68273430)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS public.aios_migrations (version integer PRIMARY KEY, digest text NOT NULL)",
    );
    const prior = await c.query(
      "SELECT digest FROM public.aios_migrations WHERE version=1",
    );
    if (prior.rowCount) {
      if (prior.rows[0].digest !== digest)
        throw new Error("migration_digest_conflict");
    } else {
      await c.query(sql);
      await c.query("INSERT INTO public.aios_migrations VALUES(1,$1)", [
        digest,
      ]);
    }
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
