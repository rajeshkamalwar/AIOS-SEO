import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  base,
  hash,
  manifestHash,
  canonical,
  uuid,
  validate,
} from "../contracts/index.js";
import { LocalBlobs } from "../evidence/index.js";
import { normalizeUrl } from "../perception/url.js";
import { assertReviewedRawFixture, assertReviewedHttpFixtureMetadata, assertReviewedFixtureUrl } from "../perception/reviewed-fixtures.js";
import { DeletionLedger } from "../policy/deletion.js";
import { transaction, scope, registryLock, workLock } from "./transaction.js";

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
export interface HttpFixtureResult {
  url: string;
  method: "GET" | "HEAD";
  status_code: number | null;
  headers: { name: string; value: string }[];
  final_url: string;
  truncated: boolean;
  error: { code: string; retryable: boolean; detail: string; evidence_ids: string[] } | null;
}
export interface HttpFixtureReceipt {
  bodyEvidenceId: string | null;
  receiptEvidenceId: string;
  observationId: string;
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
  const admission = normalizeUrl(value);
  if (admission.excluded) throw new Error("policy_blocked");
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
    assertReviewedFixtureUrl(parsed.href);
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
    p = { ...p };
    capture = structuredClone(capture);
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
      // The synthetic profile is not permission to persist arbitrary supplied
      // bytes. Review the exact retained artifact before any upload or clock write.
      assertReviewedRawFixture({mimeType:capture.mimeType,sourceUri:capture.sourceUri,bytes:data});
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
  /** Local synthetic capture only; never dispatches HTTP or authorizes worker results. */
  async acceptHttpFixture(
    p: Principal,
    site: string,
    capture: { attemptId: string; capturedAt: string },
    result: HttpFixtureResult,
    bytes: Uint8Array | null,
  ): Promise<HttpFixtureReceipt> {
    p = { ...p };
    capture = { ...capture };
    result = structuredClone(result);
    uuid(capture.attemptId);
    validate(base + "common.schema.json#/$defs/time", capture.capturedAt);
    if (Object.keys(capture).some(k => !["attemptId", "capturedAt"].includes(k))) throw new Error("schema_invalid");
    // Callers never supply an Evidence identity. It is allocated after scope checks.
    if (Object.hasOwn(result, "body_evidence_id")) throw new Error("schema_invalid");
    const input = { ...result, body_evidence_id: null };
    validate(base + "http-receipt.schema.json", input);
    const requested = fixtureUrl(result.url), final = fixtureUrl(result.final_url);
    for (const raw of [result.url, result.final_url]) {
      const admission = normalizeUrl(raw);
      if (admission.excluded || admission.url !== raw) throw new Error("policy_blocked");
    }
    if (requested.origin !== final.origin) throw new Error("scope_denied");
    const allowed = new Set(["content-type", "content-length", "content-encoding", "last-modified", "etag", "x-robots-tag", "retry-after"]);
    const names = result.headers.map(h => h.name);
    if (new Set(names).size !== names.length || result.headers.some(h => !allowed.has(h.name) || /[\r\n\0]/.test(h.value))) throw new Error("schema_invalid");
    if (result.headers.reduce((n, h) => n + Buffer.byteLength(h.name + ": " + h.value + "\r\n"), 0) > 32768) throw new Error("response_too_large");
    const body = bytes === null ? null : Buffer.from(bytes);
    const mime = result.headers.find(h => h.name === "content-type")?.value.split(";", 1)[0]!.trim().toLowerCase();
    if (body !== null && (!mime || !["text/html", "application/xhtml+xml", "text/plain", "application/xml", "text/xml"].includes(mime))) throw new Error("schema_invalid");
    if (body !== null && (result.status_code === null || result.method === "HEAD" || [204, 205, 304].includes(result.status_code))) throw new Error("schema_invalid");
    if ((result.status_code === null && result.error === null) || (result.truncated && body === null)) throw new Error("schema_invalid");
    if (result.error && result.error.evidence_ids.length !== 0) throw new Error("schema_invalid");
    if ((body?.length ?? 0) > 5242880) throw new Error("response_too_large");
    const inputHash = manifestHash({ capture, result: input, body_hash: body === null ? null : hash(body), body_bytes: body?.length ?? null });
    return this.tx(p, "write", site, async c => {
      const s = await this.get(c, "Site", site);
      if (s.normalized_origin !== requested.origin) throw new Error("scope_denied");
      assertReviewedHttpFixtureMetadata(result);
      if (body !== null) assertReviewedRawFixture({mimeType:mime!,sourceUri:result.final_url,bytes:body});
      await c.query("SELECT pg_advisory_xact_lock_shared($1)", [maintenanceLock]);
      // Serialization of one attempt precedes uploads; the tenant clock is not held during I/O.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [p.tenantId + ":" + capture.attemptId + ":" + site]);
      const prior = (await c.query("SELECT * FROM http_fixture_acceptance WHERE tenant_id=$1 AND attempt_id=$2 AND site_id=$3", [p.tenantId, capture.attemptId, site])).rows[0];
      if (prior) {
        if (prior.input_hash !== inputHash) throw new Error("conflict");
        return { bodyEvidenceId: prior.body_evidence_id, receiptEvidenceId: prior.receipt_evidence_id, observationId: prior.observation_id };
      }
      if ((await c.query("SELECT 1 FROM acceptance WHERE tenant_id=$1 AND attempt_id=$2 AND subject_id=$3", [p.tenantId, capture.attemptId, site])).rowCount) throw new Error("conflict");
      const bodyId = body === null ? null : randomUUID(), receiptId = randomUUID(), observationId = randomUUID();
      const receipt = { ...input, body_evidence_id: bodyId };
      validate(base + "http-receipt.schema.json", receipt);
      const receiptBytes = Buffer.from(canonical(receipt));
      const artifacts = [
        ...(body === null ? [] : [{ id: bodyId!, bytes: body, mime: mime! }]),
        { id: receiptId, bytes: receiptBytes, mime: "application/json" },
      ];
      for (const artifact of artifacts) await this.blobs.put(this.blobs.key(p.tenantId, site, artifact.id), artifact.bytes);
      const time = await this.clock(c, p, true);
      if (Date.parse(capture.capturedAt) > Date.parse(time.known_at)) throw new Error("future_observation");
      for (const artifact of artifacts) await this.insert(c, {
        ...this.common("Evidence", p, site, time, artifact.id), state: "available", retention_class: "raw",
        artifact_key: this.blobs.key(p.tenantId, site, artifact.id), sha256: hash(artifact.bytes), mime_type: artifact.mime,
        bytes: artifact.bytes.length, captured_at: capture.capturedAt, source_uri: final.href,
        source_class: "first_party_observation", locator: `bytes:0:${artifact.bytes.length}`, redaction_version: "none-v1",
        expires_at: new Date(Date.parse(capture.capturedAt) + 7 * 86400000).toISOString(),
      });
      await this.insert(c, {
        ...this.common("Observation", p, site, time, observationId),
        state: result.status_code === null ? "failed" : result.truncated || result.error !== null ? "partial" : "observed",
        retention_class: "raw", sensor_id: "http-fixture", sensor_version: "1.0.0", subject_id: site,
        evidence_ids: artifacts.map(a => a.id), observed_at: capture.capturedAt, window_start: null, window_end: null,
        source_timezone: "UTC", context_hash: hash(receiptBytes), fresh_until: new Date(Date.parse(capture.capturedAt) + 86400000).toISOString(),
        attempt_id: capture.attemptId, error: result.error,
      });
      await c.query("INSERT INTO http_fixture_acceptance VALUES($1,$2,$3,$4,$5,$6,$7)", [p.tenantId, site, capture.attemptId, inputHash, bodyId, receiptId, observationId]);
      // Existing capture dedupe shares the same attempt/subject namespace.
      await c.query("INSERT INTO acceptance VALUES($1,$2,$3,$4,$5,$6,$7)", [p.tenantId, site, capture.attemptId, site, inputHash, receiptId, observationId]);
      const event = {
        event_id: randomUUID(), tenant_id: p.tenantId, site_id: site, schema_version: 1,
        aggregate_id: observationId, aggregate_version: 1, causation_id: null, correlation_id: capture.attemptId,
        occurred_at: capture.capturedAt, recorded_at: time.known_at, knowledge_seq: time.known_seq,
        idempotency_key: capture.attemptId, producer: "http-fixture-collector@1.0.0", event_type: "evidence.recorded",
        payload: { evidence_id: receiptId, observation_id: observationId },
      };
      validate(base + "event.schema.json", event);
      await c.query("INSERT INTO outbox VALUES($1,$2,$3,$4,$5,$6,$7,NULL)", [p.tenantId, site, event.event_id, observationId, event.event_type, event, time.known_at]);
      return { bodyEvidenceId: bodyId, receiptEvidenceId: receiptId, observationId };
    });
  }
  /** Records existing fixture scope, never creates a Site or grants tool authority. */
  async acceptSiteScopeFixture(p: Principal, site: string, run: string, deletions: DeletionLedger): Promise<Receipt> {
    uuid(run);
    if (!(deletions instanceof DeletionLedger)) throw new Error("deletion_adapter_required");
    return transaction(this.pool, "aios_runtime", async c => {
      // Match governed-work lock ordering before authorization takes identity locks.
      await c.query("SELECT pg_advisory_xact_lock_shared($1)", [registryLock]);
      await c.query("SELECT pg_advisory_xact_lock($1)", [workLock]);
      await scope(c, p, site);
      if (await deletions.contains(p.tenantId, site)) throw new Error("deleted_scope");
      const r = (await c.query(`SELECT r.*, f.deletion_epoch AS pinned_epoch, f.quarantined, t.deletion_epoch, t.policy_profile_id
        FROM crawl r JOIN work_fence f ON f.tenant_id=r.tenant_id AND f.site_id=r.site_id AND f.crawl_id=r.id
        JOIN tenant t ON t.id=r.tenant_id WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.id=$3 FOR UPDATE OF r`, [p.tenantId, site, run])).rows[0];
      if (!r || r.submitted_by !== p.userId) throw new Error("scope_denied");
      if (!["queued", "running"].includes(r.state) || r.quarantined || r.pinned_epoch !== r.deletion_epoch) throw new Error("run_fenced");
      if (r.policy_profile_id !== "local-synthetic-v1" || r.policy_version !== "discovery-v1") throw new Error("policy_blocked");
      if (!(await c.query("SELECT 1 FROM control.health WHERE singleton AND policy_version='discovery-v1' AND restore_ready AND verified_until>clock_timestamp()")).rowCount) throw new Error("policy_unavailable");
      const s = await this.get(c, "Site", site);
      const submitted = fixtureUrl(String(s.submitted_url)), normalized = normalizeUrl(submitted.href);
      assertReviewedFixtureUrl(submitted.href);
      if (normalized.excluded || normalized.url !== s.submitted_url || submitted.origin !== s.normalized_origin) throw new Error("scope_denied");
      const fields = {
        receipt_type: "site_scope", schema_version: 1, tenant_id: p.tenantId, site_id: site, crawl_id: run,
        submitted_by: r.submitted_by, submitted_url: normalized.url, normalized_origin: submitted.origin,
        site_version: Number(s.version), deletion_epoch: Number(r.deletion_epoch), policy_version: r.policy_version,
        deployment_profile: r.policy_profile_id, authority: "fixture_only", ownership: "not_established",
        live_dispatch: false, website_write: false, expires_at: new Date(r.budget.deadline).toISOString(),
      };
      const now = (await c.query("SELECT clock_timestamp() AS now,clock_timestamp()>=$1::timestamptz AS expired", [fields.expires_at])).rows[0];
      if (now.expired) throw new Error("deadline");
      const inputHash = manifestHash(fields);
      const prior = (await c.query("SELECT * FROM site_scope_acceptance WHERE tenant_id=$1 AND crawl_id=$2", [p.tenantId, run])).rows[0];
      if (prior) {
        if (prior.input_hash !== inputHash) throw new Error("conflict");
        return { evidenceId: prior.evidence_id, observationId: prior.observation_id };
      }
      const receipt = { ...fields, issued_at: new Date(now.now).toISOString() };
      validate(base + "scope-receipt.schema.json", receipt);
      const data = Buffer.from(canonical(receipt)), evidenceId = randomUUID(), observationId = randomUUID(), attemptId = randomUUID();
      const artifactKey = this.blobs.key(p.tenantId, site, evidenceId);
      await c.query("SELECT pg_advisory_xact_lock_shared($1)", [maintenanceLock]);
      await this.blobs.put(artifactKey, data);
      if (await deletions.contains(p.tenantId, site)) throw new Error("deleted_scope");
      if (!(await c.query("SELECT 1 FROM control.health WHERE singleton AND policy_version='discovery-v1' AND restore_ready AND verified_until>clock_timestamp()")).rowCount) throw new Error("policy_unavailable");
      const time = await this.clock(c, p, true);
      if (Date.parse(time.known_at) >= Date.parse(fields.expires_at)) throw new Error("deadline");
      await this.insert(c, {
        ...this.common("Evidence", p, site, time, evidenceId), state: "available", retention_class: "raw",
        artifact_key: artifactKey, sha256: hash(data), mime_type: "application/json", bytes: data.length,
        captured_at: receipt.issued_at, source_uri: fields.submitted_url, source_class: "internal_policy",
        locator: `bytes:0:${data.length}`, redaction_version: "none-v1", expires_at: new Date(Date.parse(receipt.issued_at) + 7 * 86400000).toISOString(),
      });
      await this.insert(c, {
        ...this.common("Observation", p, site, time, observationId), state: "observed", retention_class: "raw",
        sensor_id: "site-scope", sensor_version: "1.0.0", subject_id: run, evidence_ids: [evidenceId],
        observed_at: receipt.issued_at, window_start: null, window_end: null, source_timezone: "UTC",
        context_hash: hash(data), fresh_until: fields.expires_at, attempt_id: attemptId, error: null,
      });
      await c.query("INSERT INTO site_scope_acceptance VALUES($1,$2,$3,$4,$5,$6)", [p.tenantId, site, run, inputHash, evidenceId, observationId]);
      await c.query("INSERT INTO acceptance VALUES($1,$2,$3,$4,$5,$6,$7)", [p.tenantId, site, attemptId, run, inputHash, evidenceId, observationId]);
      const event = { event_id: randomUUID(), tenant_id: p.tenantId, site_id: site, schema_version: 1,
        aggregate_id: observationId, aggregate_version: 1, causation_id: null, correlation_id: run,
        occurred_at: receipt.issued_at, recorded_at: time.known_at, knowledge_seq: time.known_seq,
        idempotency_key: run, producer: "site-scope-fixture@1.0.0", event_type: "evidence.recorded",
        payload: { evidence_id: evidenceId, observation_id: observationId } };
      validate(base + "event.schema.json", event);
      await c.query("INSERT INTO outbox VALUES($1,$2,$3,$4,$5,$6,$7,NULL)", [p.tenantId, site, event.event_id, observationId, event.event_type, event, time.known_at]);
      if (await deletions.contains(p.tenantId, site)) throw new Error("deleted_scope");
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
    p = { ...p };
    return this.tx(p, "expert", site, async (c) => {
      const row = await this.get(c, "Evidence", id);
      if (row.site_id !== site) throw new Error("not_found");
      if (
        row.state !== "available" ||
        Date.parse(String(row.expires_at)) <= Date.now()
      )
        throw new Error("artifact_unavailable");
      const bytes = await this.blobs.read(
        String(row.artifact_key),
        String(row.sha256),
        Number(row.bytes),
      );
      if (row.redaction_version === "none-v1") {
        // Legacy rows were not necessarily admitted by the current catalog.
        // Authenticate generated receipts through stored acceptance relations;
        // JSON content cannot classify itself as trusted policy output.
        const accepted = (await c.query(
          "SELECT * FROM http_fixture_acceptance WHERE tenant_id=$1 AND site_id=$2 AND (body_evidence_id=$3 OR receipt_evidence_id=$3)",
          [p.tenantId,site,id],
        )).rows[0];
        if (accepted) {
          const context = accepted.receipt_evidence_id === id ? row : await this.get(c,"Evidence",accepted.receipt_evidence_id);
          if (context.site_id !== site || context.state !== "available" || context.mime_type !== "application/json" || Date.parse(String(context.expires_at)) <= Date.now()) throw new Error("artifact_unavailable");
          const contextBytes = accepted.receipt_evidence_id === id ? bytes : await this.blobs.read(String(context.artifact_key),String(context.sha256),Number(context.bytes));
          const receipt = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(contextBytes));
          validate(base+"http-receipt.schema.json",receipt);
          if (!contextBytes.equals(Buffer.from(canonical(receipt)))) throw new Error("unreviewed_fixture");
          const {body_evidence_id,...metadata} = receipt;
          if (body_evidence_id !== accepted.body_evidence_id || receipt.final_url !== row.source_uri || receipt.final_url !== context.source_uri) throw new Error("unreviewed_fixture");
          assertReviewedHttpFixtureMetadata(metadata);
          if (accepted.body_evidence_id === id) assertReviewedRawFixture({mimeType:String(row.mime_type),sourceUri:String(row.source_uri),bytes});
        } else {
          const generated = (await c.query("SELECT crawl_id FROM site_scope_acceptance WHERE tenant_id=$1 AND site_id=$2 AND evidence_id=$3",[p.tenantId,site,id])).rows[0];
          if (generated) {
            const receipt = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
            validate(base+"scope-receipt.schema.json",receipt);
            if (!bytes.equals(Buffer.from(canonical(receipt)))) throw new Error("unreviewed_fixture");
            assertReviewedFixtureUrl(receipt.submitted_url);
            assertReviewedFixtureUrl(receipt.normalized_origin+"/");
            if (row.mime_type !== "application/json" || row.source_class !== "internal_policy" || receipt.tenant_id !== p.tenantId || receipt.site_id !== site || receipt.crawl_id !== generated.crawl_id || fixtureUrl(receipt.submitted_url).origin !== receipt.normalized_origin) throw new Error("unreviewed_fixture");
          } else {
            if (!(await c.query("SELECT 1 FROM acceptance WHERE tenant_id=$1 AND site_id=$2 AND evidence_id=$3",[p.tenantId,site,id])).rowCount) throw new Error("unreviewed_fixture");
            assertReviewedRawFixture({mimeType:String(row.mime_type),sourceUri:String(row.source_uri),bytes});
          }
        }
      }
      return bytes;
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
