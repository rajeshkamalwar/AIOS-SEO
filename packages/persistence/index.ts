import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  base,
  hash,
  manifestHash,
  uuid,
  validate,
} from "../contracts/index.js";
import { LocalBlobs } from "../evidence/index.js";

type Row = Record<string, unknown>;
export interface Principal {
  tenantId: string;
  userId: string;
}
export interface Cutoff {
  known_seq: number;
  known_at: string;
}
export interface Receipt {
  evidenceId: string;
  observationId: string;
}
export interface Capture {
  attemptId: string;
  sourceUri: string;
  capturedAt: string;
  mimeType: "text/html" | "application/json";
  contextHash: string;
}
const tables: Record<string, string> = {
  Site: "site",
  Evidence: "evidence",
  Observation: "observation",
  EvidenceBundle: "evidence_bundle",
};
const referenceFields = new Set([
  "provenance_ids",
  "evidence_ids",
  "observation_ids",
  "assertion_ids",
]);
const maintenanceLock = 68273431;
function normalize(row: Row): Row {
  const result = { ...row };
  for (const [key, value] of Object.entries(result))
    if (typeof value === "string" && /(_at|_until|_from|_to)$/.test(key))
      result[key] = new Date(value).toISOString();
  return result;
}
function fixtureUrl(value: string): URL {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    !u.hostname.endsWith(".example") ||
    u.username ||
    u.password ||
    u.port ||
    u.hash
  )
    throw new Error("policy_blocked");
  return u;
}

/** Internal library only. Principal must originate in a verified adapter; M1 accepts fixture identities only. */
export class Ledger {
  constructor(
    private readonly pool: Pool,
    private readonly blobs: LocalBlobs,
    profile: string,
  ) {
    if (profile !== "local-synthetic-v1") throw new Error("policy_blocked");
  }
  private async tx<T>(
    p: Principal,
    mode: "read" | "write" | "expert",
    site: string | null,
    fn: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
    uuid(p.tenantId);
    uuid(p.userId);
    if (site !== null) uuid(site);
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SET LOCAL search_path=aios,pg_catalog; SET LOCAL statement_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='10s'",
      );
      const role = await c.query(
        "SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
      );
      if (
        role.rows[0].rolname !== "aios_runtime" ||
        role.rows[0].rolsuper ||
        role.rows[0].rolbypassrls
      )
        throw new Error("unsafe_runtime_role");
      await c.query(
        "SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",
        [p.tenantId, p.userId],
      );
      await c.query("SELECT authorize($1,$2)", [mode, site]);
      const result = await fn(c);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  private async clock(
    c: PoolClient,
    p: Principal,
    advance: boolean,
  ): Promise<Cutoff> {
    await c.query(
      "INSERT INTO knowledge_clock VALUES($1,0,clock_timestamp()) ON CONFLICT DO NOTHING",
      [p.tenantId],
    );
    const row = await c.query(
      "SELECT seq,recorded_at FROM knowledge_clock WHERE tenant_id=$1 FOR UPDATE",
      [p.tenantId],
    );
    if (!advance)
      return {
        known_seq: Number(row.rows[0].seq),
        known_at: new Date(row.rows[0].recorded_at).toISOString(),
      };
    const next = await c.query(
      "UPDATE knowledge_clock SET seq=seq+1,recorded_at=greatest(clock_timestamp(),recorded_at) WHERE tenant_id=$1 RETURNING seq,recorded_at",
      [p.tenantId],
    );
    await c.query(
      "INSERT INTO knowledge_commit SELECT tenant_id,seq,recorded_at FROM knowledge_clock WHERE tenant_id=$1",
      [p.tenantId],
    );
    return {
      known_seq: Number(next.rows[0].seq),
      known_at: new Date(next.rows[0].recorded_at).toISOString(),
    };
  }
  private common(
    type: string,
    p: Principal,
    site: string,
    time: Cutoff,
    id = randomUUID(),
  ): Row {
    return {
      record_type: type,
      id,
      schema_version: 1,
      version: 1,
      created_at: time.known_at,
      recorded_at: time.known_at,
      updated_at: time.known_at,
      deleted_at: null,
      provenance_ids: [],
      tenant_id: p.tenantId,
      site_id: site,
      knowledge_seq: time.known_seq,
    };
  }
  private async insert(c: PoolClient, row: Row): Promise<void> {
    const type = String(row.record_type),
      table = tables[type];
    if (!table) throw new Error("unsupported_record");
    validate(base + "domain.schema.json#/$defs/" + type, row);
    const entries = Object.entries(row).filter(
      ([k]) => !referenceFields.has(k),
    );
    // Column names come only from schema-validated records and a closed table registry.
    await c.query(
      `INSERT INTO ${table} (${entries.map(([k]) => k).join(",")}) VALUES (${entries.map((_, i) => "$" + (i + 1)).join(",")})`,
      entries.map(([, v]) => v),
    );
    for (const key of referenceFields) {
      const ids = (row[key] ?? []) as string[];
      for (const [ordinal, target] of ids.entries()) {
        const found = await c.query(
          "SELECT record_type FROM record_index WHERE tenant_id=$1 AND id=$2",
          [row.tenant_id, target],
        );
        if (!found.rowCount) throw new Error("scope_denied");
        await c.query("INSERT INTO record_link VALUES($1,$2,$3,$4,$5,$6)", [
          row.tenant_id,
          row.id,
          key,
          ordinal,
          target,
          found.rows[0].record_type,
        ]);
      }
    }
  }
  private async get(c: PoolClient, type: string, id: string): Promise<Row> {
    uuid(id);
    const table = tables[type];
    if (!table) throw new Error("unsupported_record");
    const found = await c.query(
      `SELECT to_jsonb(t) AS row FROM ${table} t WHERE id=$1`,
      [id],
    );
    if (!found.rowCount) throw new Error("not_found");
    const row = normalize(found.rows[0].row);
    const fields =
      type === "EvidenceBundle"
        ? ["provenance_ids", "evidence_ids", "observation_ids", "assertion_ids"]
        : type === "Observation"
          ? ["provenance_ids", "evidence_ids"]
          : ["provenance_ids"];
    for (const field of fields) {
      const links = await c.query(
        "SELECT target_id FROM record_link WHERE owner_id=$1 AND field_name=$2 ORDER BY ordinal",
        [id, field],
      );
      row[field] = links.rows.map((v) => v.target_id);
    }
    validate(base + "domain.schema.json#/$defs/" + type, row);
    return row;
  }
  async registerSite(p: Principal, url: string): Promise<string> {
    const parsed = fixtureUrl(url);
    return this.tx(p, "write", null, async (c) => {
      await this.clock(c, p, false);
      const prior = await c.query(
        "SELECT id FROM site WHERE normalized_origin=$1",
        [parsed.origin],
      );
      if (prior.rowCount) return prior.rows[0].id;
      const time = await this.clock(c, p, true);
      const id = randomUUID();
      await this.insert(c, {
        ...this.common("Site", p, id, time, id),
        state: "provisional",
        retention_class: "identity",
        business_id: null,
        submitted_url: parsed.href,
        normalized_origin: parsed.origin,
        normalization_version: "url-v1",
        origins: [parsed.origin],
      });
      return id;
    });
  }
  async accept(
    p: Principal,
    site: string,
    capture: Capture,
    bytes: Uint8Array,
  ): Promise<Receipt> {
    validate(base + "capture.schema.json", capture);
    if (!["text/html", "application/json"].includes(capture.mimeType))
      throw new Error("schema_invalid");
    const source = fixtureUrl(capture.sourceUri);
    const data = Buffer.from(bytes);
    const sha = hash(data);
    const inputHash = manifestHash({
      ...capture,
      sha256: sha,
      bytes: data.length,
    });
    return this.tx(p, "write", site, async (c) => {
      const scope = await this.get(c, "Site", site);
      if (source.origin !== scope.normalized_origin)
        throw new Error("scope_denied");
      await c.query("SELECT pg_advisory_xact_lock_shared($1)", [
        maintenanceLock,
      ]);
      const evidenceId = randomUUID(),
        observationId = randomUUID();
      const key = this.blobs.key(p.tenantId, site, evidenceId);
      await this.blobs.put(key, data);
      // Upload is complete before taking the tenant acceptance clock. An aborted write leaves a private orphan.
      await this.clock(c, p, false);
      const prior = await c.query(
        "SELECT * FROM acceptance WHERE tenant_id=$1 AND attempt_id=$2 AND subject_id=$3",
        [p.tenantId, capture.attemptId, site],
      );
      if (prior.rowCount) {
        if (prior.rows[0].input_hash !== inputHash) throw new Error("conflict");
        return {
          evidenceId: prior.rows[0].evidence_id,
          observationId: prior.rows[0].observation_id,
        };
      }
      const time = await this.clock(c, p, true);
      if (Date.parse(capture.capturedAt) > Date.parse(time.known_at))
        throw new Error("future_observation");
      const expires = new Date(
        Date.parse(capture.capturedAt) + 7 * 86400000,
      ).toISOString();
      await this.insert(c, {
        ...this.common("Evidence", p, site, time, evidenceId),
        state: "available",
        retention_class: "raw",
        artifact_key: key,
        sha256: sha,
        mime_type: capture.mimeType,
        bytes: data.length,
        captured_at: capture.capturedAt,
        source_uri: source.href,
        source_class: "first_party_observation",
        locator: `bytes:0:${data.length}`,
        redaction_version: "none-v1",
        expires_at: expires,
      });
      await this.insert(c, {
        ...this.common("Observation", p, site, time, observationId),
        state: "observed",
        retention_class: "raw",
        sensor_id: "http",
        sensor_version: "1.0.0",
        subject_id: site,
        evidence_ids: [evidenceId],
        observed_at: capture.capturedAt,
        window_start: null,
        window_end: null,
        source_timezone: "UTC",
        context_hash: capture.contextHash,
        fresh_until: new Date(
          Date.parse(capture.capturedAt) + 86400000,
        ).toISOString(),
        attempt_id: capture.attemptId,
        error: null,
      });
      await c.query("INSERT INTO acceptance VALUES($1,$2,$3,$4,$5,$6,$7)", [
        p.tenantId,
        site,
        capture.attemptId,
        site,
        inputHash,
        evidenceId,
        observationId,
      ]);
      const event = {
        event_id: randomUUID(),
        tenant_id: p.tenantId,
        site_id: site,
        schema_version: 1,
        aggregate_id: observationId,
        aggregate_version: 1,
        causation_id: null,
        correlation_id: capture.attemptId,
        occurred_at: capture.capturedAt,
        recorded_at: time.known_at,
        knowledge_seq: time.known_seq,
        idempotency_key: capture.attemptId,
        producer: "fixture-collector@0.0.1",
        event_type: "evidence.recorded",
        payload: { evidence_id: evidenceId, observation_id: observationId },
      };
      validate(base + "event.schema.json", event);
      await c.query("INSERT INTO outbox VALUES($1,$2,$3,$4,$5,$6,$7,NULL)", [
        p.tenantId,
        site,
        event.event_id,
        observationId,
        event.event_type,
        event,
        time.known_at,
      ]);
      return { evidenceId, observationId };
    });
  }
  async cutoff(p: Principal, site: string): Promise<Cutoff> {
    return this.tx(p, "read", site, (c) => this.clock(c, p, false));
  }
  async observation(
    p: Principal,
    site: string,
    id: string,
    cutoff?: Cutoff,
  ): Promise<Row> {
    return this.tx(p, "read", site, async (c) => {
      const row = await this.get(c, "Observation", id);
      if (
        row.site_id !== site ||
        (cutoff && Number(row.knowledge_seq) > cutoff.known_seq)
      )
        throw new Error("not_found");
      return row;
    });
  }
  async artifact(p: Principal, site: string, id: string): Promise<Buffer> {
    return this.tx(p, "expert", site, async (c) => {
      const row = await this.get(c, "Evidence", id);
      if (row.site_id !== site) throw new Error("not_found");
      if (
        row.state !== "available" ||
        Date.parse(String(row.expires_at)) <= Date.now()
      )
        throw new Error("artifact_unavailable");
      return this.blobs.read(
        String(row.artifact_key),
        String(row.sha256),
        Number(row.bytes),
      );
    });
  }
  async freeze(
    p: Principal,
    site: string,
    cutoff: Cutoff,
    evidenceIds: string[],
    observationIds: string[],
  ): Promise<string> {
    return this.tx(p, "write", site, async (c) => {
      await this.clock(c, p, false);
      const issued = await c.query(
        "SELECT recorded_at FROM knowledge_commit WHERE tenant_id=$1 AND seq=$2",
        [p.tenantId, cutoff.known_seq],
      );
      if (
        !issued.rowCount ||
        new Date(issued.rows[0].recorded_at).toISOString() !== cutoff.known_at
      )
        throw new Error("invalid_cutoff");
      for (const [type, ids] of [
        ["Evidence", evidenceIds],
        ["Observation", observationIds],
      ] as const)
        for (const id of ids) {
          const row = await this.get(c, type, id);
          if (
            row.site_id !== site ||
            Number(row.knowledge_seq) > cutoff.known_seq
          )
            throw new Error("invalid_bundle_reference");
          if (
            type === "Observation" &&
            (row.evidence_ids as string[]).some((x) => !evidenceIds.includes(x))
          )
            throw new Error("incomplete_bundle");
        }
      const manifest = {
        evidence_ids: [...evidenceIds].sort(),
        observation_ids: [...observationIds].sort(),
        assertion_ids: [],
        ...cutoff,
      };
      const time = await this.clock(c, p, true),
        id = randomUUID();
      await this.insert(c, {
        ...this.common("EvidenceBundle", p, site, time, id),
        state: "frozen",
        retention_class: "derived",
        ...manifest,
        manifest_hash: manifestHash(manifest),
      });
      return id;
    });
  }
  async bundle(p: Principal, site: string, id: string): Promise<Row> {
    return this.tx(p, "read", site, async (c) => {
      const row = await this.get(c, "EvidenceBundle", id);
      if (row.site_id !== site) throw new Error("not_found");
      return row;
    });
  }
  async pending(p: Principal, site: string): Promise<Row[]> {
    return this.tx(p, "read", site, async (c) =>
      (
        await c.query(
          "SELECT payload FROM outbox WHERE site_id=$1 AND dispatched_at IS NULL ORDER BY recorded_at,event_id LIMIT 50",
          [site],
        )
      ).rows.map((x) => x.payload),
    );
  }
  async deliver(p: Principal, site: string, eventId: string): Promise<boolean> {
    uuid(eventId);
    return this.tx(p, "write", site, async (c) => {
      const found = await c.query(
        "SELECT payload FROM outbox WHERE event_id=$1 AND site_id=$2",
        [eventId, site],
      );
      if (!found.rowCount) throw new Error("not_found");
      const event = found.rows[0].payload;
      validate(base + "event.schema.json", event);
      const inserted = await c.query(
        "INSERT INTO inbox(tenant_id,consumer,event_id) VALUES($1,'evidence-projection-v1',$2) ON CONFLICT DO NOTHING RETURNING event_id",
        [p.tenantId, eventId],
      );
      if (!inserted.rowCount) return false;
      await c.query("INSERT INTO evidence_projection VALUES($1,$2,$3)", [
        p.tenantId,
        eventId,
        event.payload.evidence_id,
      ]);
      await c.query(
        "UPDATE outbox SET dispatched_at=clock_timestamp() WHERE event_id=$1",
        [eventId],
      );
      return true;
    });
  }
}

/** Offline maintenance only, requires a migration-owner connection with complete visibility. */
export async function sweepOrphans(
  admin: Pool,
  blobs: LocalBlobs,
): Promise<number> {
  const c = await admin.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock($1)", [maintenanceLock]);
    const role = await c.query(
      "SELECT rolsuper FROM pg_roles WHERE rolname=current_user",
    );
    if (!role.rows[0].rolsuper)
      throw new Error("maintenance_authority_required");
    const keys = await c.query("SELECT artifact_key FROM aios.evidence");
    const count = await blobs.removeUnreferenced(
      new Set(keys.rows.map((x) => x.artifact_key)),
    );
    await c.query("COMMIT");
    return count;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
