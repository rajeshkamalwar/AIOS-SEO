SET search_path=aios,pg_catalog;
-- Storage prerequisite only. No role receives worker-result write authority.
CREATE TABLE render_snapshot (
 record_type text NOT NULL CHECK(record_type='RenderSnapshot'), id uuid NOT NULL,
 schema_version bigint NOT NULL CHECK(schema_version=1), version bigint NOT NULL CHECK(version>=1),
 created_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
 state text NOT NULL CHECK(state IN ('captured','timeout','policy_limited','failed')),
 retention_class text NOT NULL CHECK(retention_class='raw'), tenant_id uuid NOT NULL, site_id uuid NOT NULL,
 series_id uuid NOT NULL, valid_from timestamptz, valid_to timestamptz, superseded_at timestamptz,
 page_snapshot_id uuid NOT NULL, observation_id uuid NOT NULL, evidence_id uuid,
 observed_at timestamptz NOT NULL, browser_build text NOT NULL CHECK(length(browser_build) BETWEEN 1 AND 4096),
 context_hash text NOT NULL CHECK(context_hash ~ '^[a-f0-9]{64}$'), sample_offset_ms bigint NOT NULL CHECK(sample_offset_ms>=0),
 critical_text_hash text CHECK(critical_text_hash ~ '^[a-f0-9]{64}$'), pending_requests bigint NOT NULL CHECK(pending_requests>=0),
 knowledge_seq bigint NOT NULL CHECK(knowledge_seq BETWEEN 1 AND 9007199254740991),
 superseded_seq bigint CHECK(superseded_seq BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,site_id,id), UNIQUE(tenant_id,series_id,version),
 UNIQUE(tenant_id,observation_id,sample_offset_ms),
 FOREIGN KEY(tenant_id,site_id,page_snapshot_id) REFERENCES page_snapshot(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,observation_id) REFERENCES observation(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,evidence_id) REFERENCES evidence(tenant_id,site_id,id),
 CHECK(state<>'captured' OR evidence_id IS NOT NULL), CHECK(updated_at=recorded_at),
 CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_to>valid_from),
 CHECK((superseded_at IS NULL)=(superseded_seq IS NULL)),
 CHECK(superseded_seq IS NULL OR superseded_seq>knowledge_seq)
);
CREATE TABLE resource_observation (
 record_type text NOT NULL CHECK(record_type='ResourceObservation'), id uuid NOT NULL,
 schema_version bigint NOT NULL CHECK(schema_version=1), version bigint NOT NULL CHECK(version>=1),
 created_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
 state text NOT NULL CHECK(state IN ('received','blocked','failed')), retention_class text NOT NULL CHECK(retention_class='raw'),
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, render_snapshot_id uuid, crawl_id uuid NOT NULL,
 url text NOT NULL CHECK(length(url) BETWEEN 1 AND 4096),
 method text NOT NULL CHECK(method IN ('GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS','OTHER')),
 resource_type text NOT NULL CHECK(resource_type IN ('document','script','stylesheet','image','font','xhr','other')),
 status_code bigint CHECK(status_code BETWEEN 100 AND 599), error_code text CHECK(length(error_code) BETWEEN 1 AND 4096),
 observed_at timestamptz NOT NULL, bytes bigint NOT NULL CHECK(bytes>=0),
 knowledge_seq bigint NOT NULL CHECK(knowledge_seq BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,render_snapshot_id) REFERENCES render_snapshot(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 CHECK(updated_at=recorded_at)
);
CREATE INDEX render_snapshot_time ON render_snapshot(tenant_id,site_id,recorded_at);
CREATE INDEX render_snapshot_series ON render_snapshot(tenant_id,series_id,recorded_at,superseded_at);
CREATE INDEX render_snapshot_valid ON render_snapshot(tenant_id,series_id,valid_from);
CREATE INDEX resource_observation_time ON resource_observation(tenant_id,site_id,recorded_at);
CREATE TRIGGER index_render_snapshot AFTER INSERT ON render_snapshot FOR EACH ROW EXECUTE FUNCTION index_record();
CREATE TRIGGER index_resource_observation AFTER INSERT ON resource_observation FOR EACH ROW EXECUTE FUNCTION index_record();
-- Future audited supersession/deletion commands must deliberately extend this
-- guard; until installed, even migration-owner payload changes fail closed.
CREATE TRIGGER immutable_render_snapshot BEFORE UPDATE OR DELETE ON render_snapshot FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable_resource_observation BEFORE UPDATE OR DELETE ON resource_observation FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE FUNCTION guard_resource_render_run() RETURNS trigger LANGUAGE plpgsql SET search_path=aios,pg_catalog AS $$
BEGIN
 IF NEW.render_snapshot_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM render_snapshot r JOIN page_snapshot p ON p.tenant_id=r.tenant_id AND p.site_id=r.site_id AND p.id=r.page_snapshot_id
  WHERE r.tenant_id=NEW.tenant_id AND r.site_id=NEW.site_id AND r.id=NEW.render_snapshot_id AND p.crawl_id=NEW.crawl_id
 ) THEN RAISE EXCEPTION 'scope_denied'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER resource_render_run BEFORE INSERT ON resource_observation FOR EACH ROW EXECUTE FUNCTION guard_resource_render_run();
CREATE FUNCTION immutable_render_links() RETURNS trigger LANGUAGE plpgsql SET search_path=aios,pg_catalog AS $$
BEGIN
 IF TG_OP IN ('DELETE','UPDATE') THEN
  IF EXISTS(SELECT 1 FROM record_index WHERE tenant_id=OLD.tenant_id AND id=OLD.owner_id AND record_type IN ('RenderSnapshot','ResourceObservation')) THEN RAISE EXCEPTION 'immutable_reference_set'; END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  IF EXISTS(SELECT 1 FROM record_index WHERE tenant_id=NEW.tenant_id AND id=NEW.owner_id AND record_type IN ('RenderSnapshot','ResourceObservation') AND created_xid<>pg_current_xact_id()) THEN RAISE EXCEPTION 'immutable_reference_set'; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER immutable_render_links BEFORE INSERT OR UPDATE OR DELETE ON record_link FOR EACH ROW EXECUTE FUNCTION immutable_render_links();
ALTER TABLE render_snapshot ENABLE ROW LEVEL SECURITY; ALTER TABLE render_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE resource_observation ENABLE ROW LEVEL SECURITY; ALTER TABLE resource_observation FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON render_snapshot USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE POLICY scoped ON resource_observation USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
REVOKE ALL ON render_snapshot,resource_observation FROM PUBLIC,aios_runtime,aios_scheduler,aios_evaluator,aios_operator;
GRANT SELECT ON render_snapshot,resource_observation TO aios_runtime,aios_scheduler,aios_evaluator,aios_operator;
