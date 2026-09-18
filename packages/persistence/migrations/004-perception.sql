-- Storage prerequisite only. No collector/worker result authority is granted here.
SET search_path=aios,pg_catalog;
ALTER TABLE observation ADD UNIQUE(tenant_id,site_id,id);

-- url_key is the full url-v1 normalized URL, never a digest. A future hash
-- accelerator must still compare this full key to preserve collision safety.

CREATE TABLE crawl_target (
 record_type text NOT NULL CHECK(record_type='CrawlTarget'), id uuid NOT NULL,
 schema_version bigint NOT NULL CHECK(schema_version=1), version bigint NOT NULL CHECK(version>=1),
 created_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
 state text NOT NULL CHECK(state IN ('discovered','queued','fetching','visited','failed','excluded','deferred')),
 retention_class text NOT NULL CHECK(retention_class='operations'),
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, crawl_id uuid NOT NULL,
 url text NOT NULL CHECK(length(url) BETWEEN 1 AND 4096),
 url_key text NOT NULL CHECK(length(url_key) BETWEEN 1 AND 4096),
 depth bigint NOT NULL CHECK(depth>=0), seed_kind text NOT NULL CHECK(seed_kind IN ('submitted','sitemap','link','redirect')),
 discovered_from_id uuid, admitted boolean NOT NULL, priority bigint NOT NULL CHECK(priority>=0),
 attempts bigint NOT NULL CHECK(attempts>=0), reason text CHECK(length(reason) BETWEEN 1 AND 4096),
 knowledge_seq bigint NOT NULL CHECK(knowledge_seq BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,site_id,crawl_id,id),
 UNIQUE(tenant_id,crawl_id,url_key),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,crawl_id,discovered_from_id) REFERENCES crawl_target(tenant_id,site_id,crawl_id,id),
 CHECK(state NOT IN ('queued','fetching','visited') OR admitted),
 CHECK(state<>'excluded' OR (NOT admitted AND reason IS NOT NULL))
);
CREATE TABLE page (
 record_type text NOT NULL CHECK(record_type='Page'), id uuid NOT NULL,
 schema_version bigint NOT NULL CHECK(schema_version=1), version bigint NOT NULL CHECK(version>=1),
 created_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
 state text NOT NULL CHECK(state='active'), retention_class text NOT NULL CHECK(retention_class='derived'),
 tenant_id uuid NOT NULL, site_id uuid NOT NULL,
 url text NOT NULL CHECK(length(url) BETWEEN 1 AND 4096), url_key text NOT NULL CHECK(length(url_key) BETWEEN 1 AND 4096),
 page_type text NOT NULL CHECK(page_type IN ('home','service','product','category','article','about','contact','other','unknown')),
 type_support jsonb NOT NULL CHECK(jsonb_typeof(type_support)='object'),
 knowledge_seq bigint NOT NULL CHECK(knowledge_seq BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,site_id,id), UNIQUE(tenant_id,site_id,url_key),
 FOREIGN KEY(tenant_id,site_id) REFERENCES site(tenant_id,id)
);
CREATE TABLE page_snapshot (
 record_type text NOT NULL CHECK(record_type='PageSnapshot'), id uuid NOT NULL,
 schema_version bigint NOT NULL CHECK(schema_version=1), version bigint NOT NULL CHECK(version>=1),
 created_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
 state text NOT NULL CHECK(state IN ('captured','partial')), retention_class text NOT NULL CHECK(retention_class='raw'),
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, series_id uuid NOT NULL,
 valid_from timestamptz, valid_to timestamptz, superseded_at timestamptz,
 page_id uuid NOT NULL, crawl_id uuid NOT NULL, observation_id uuid NOT NULL, evidence_id uuid NOT NULL,
 observed_at timestamptz NOT NULL, status_code bigint NOT NULL CHECK(status_code BETWEEN 100 AND 599),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 main_text_hash text CHECK(main_text_hash ~ '^[a-f0-9]{64}$'), truncated boolean NOT NULL,
 knowledge_seq bigint NOT NULL CHECK(knowledge_seq BETWEEN 1 AND 9007199254740991),
 superseded_seq bigint CHECK(superseded_seq BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,site_id,id),
 UNIQUE(tenant_id,observation_id), UNIQUE(tenant_id,series_id,version),
 FOREIGN KEY(tenant_id,site_id,page_id) REFERENCES page(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,observation_id) REFERENCES observation(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,evidence_id) REFERENCES evidence(tenant_id,site_id,id),
 CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_to>valid_from),
 CHECK((superseded_at IS NULL)=(superseded_seq IS NULL)),
 CHECK(superseded_seq IS NULL OR superseded_seq>knowledge_seq),
 CHECK(NOT truncated OR state='partial'), CHECK(updated_at=recorded_at)
);
CREATE INDEX crawl_target_frontier ON crawl_target(tenant_id,site_id,crawl_id,state,priority,depth,url_key);
CREATE INDEX crawl_target_time ON crawl_target(tenant_id,site_id,recorded_at);
CREATE INDEX page_time ON page(tenant_id,site_id,recorded_at);
CREATE INDEX page_snapshot_time ON page_snapshot(tenant_id,site_id,recorded_at);
CREATE INDEX page_snapshot_valid ON page_snapshot(tenant_id,page_id,valid_from);
CREATE INDEX page_snapshot_series ON page_snapshot(tenant_id,series_id,knowledge_seq);
CREATE TRIGGER index_crawl_target AFTER INSERT ON crawl_target FOR EACH ROW EXECUTE FUNCTION index_record();
CREATE TRIGGER index_page AFTER INSERT ON page FOR EACH ROW EXECUTE FUNCTION index_record();
CREATE TRIGGER index_page_snapshot AFTER INSERT ON page_snapshot FOR EACH ROW EXECUTE FUNCTION index_record();
ALTER TABLE crawl_target ENABLE ROW LEVEL SECURITY; ALTER TABLE crawl_target FORCE ROW LEVEL SECURITY;
ALTER TABLE page ENABLE ROW LEVEL SECURITY; ALTER TABLE page FORCE ROW LEVEL SECURITY;
ALTER TABLE page_snapshot ENABLE ROW LEVEL SECURITY; ALTER TABLE page_snapshot FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON crawl_target USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE POLICY scoped ON page USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE POLICY scoped ON page_snapshot USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
GRANT SELECT ON crawl_target,page,page_snapshot TO aios_runtime,aios_scheduler,aios_evaluator,aios_operator;
-- A later fenced domain command must validate canonical records and commit accepted
-- evidence, observation, snapshot and outbox together. Never grant workers SQL writes.
