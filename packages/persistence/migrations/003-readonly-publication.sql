SET search_path=aios,pg_catalog;
CREATE TABLE publication (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, watermark bigint NOT NULL CHECK(watermark>=0),
 published_at timestamptz NOT NULL DEFAULT clock_timestamp(), twin_revision_id uuid,
 cards jsonb NOT NULL, graph jsonb NOT NULL, coverage jsonb NOT NULL, missing_sources text[] NOT NULL,
 PRIMARY KEY(tenant_id,site_id,watermark), FOREIGN KEY(tenant_id,site_id) REFERENCES site(tenant_id,id)
);
CREATE INDEX publication_latest ON publication(tenant_id,site_id,watermark DESC);
ALTER TABLE publication ENABLE ROW LEVEL SECURITY; ALTER TABLE publication FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON publication USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
GRANT SELECT,INSERT ON publication TO aios_runtime,aios_operator;
