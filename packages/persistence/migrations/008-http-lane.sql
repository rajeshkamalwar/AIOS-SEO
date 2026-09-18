SET search_path=aios,pg_catalog;
-- Global scheduling metadata contains a DNS-host lane key and counters only, never page data.
-- Keys use https:// plus lowercase hostname without trailing dots to share HTTP/HTTPS aliases.
-- Receipt origin remains exact Site scope; this key never grants fetch authority.
CREATE TABLE control.http_origin (
 origin text PRIMARY KEY, last_started_at timestamptz NOT NULL,
 in_flight integer NOT NULL CHECK(in_flight BETWEEN 0 AND 2)
);
CREATE TABLE http_reservation (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, crawl_id uuid NOT NULL,
 job_id uuid NOT NULL, attempt_no integer NOT NULL, attempt_id uuid NOT NULL,
 lease_token uuid NOT NULL, reservation_id uuid NOT NULL, origin text NOT NULL,
 reserved_bytes bigint NOT NULL CHECK(reserved_bytes BETWEEN 1 AND 5242880),
 actual_bytes bigint CHECK(actual_bytes BETWEEN 0 AND reserved_bytes),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(), settled_at timestamptz,
 PRIMARY KEY(tenant_id,reservation_id), UNIQUE(tenant_id,job_id,attempt_no),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,job_id,attempt_no) REFERENCES job_attempt(tenant_id,job_id,attempt_no),
 CHECK((actual_bytes IS NULL)=(settled_at IS NULL))
);
ALTER TABLE http_reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE http_reservation FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON http_reservation USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
REVOKE ALL ON http_reservation,control.http_origin FROM PUBLIC,aios_runtime,aios_evaluator,aios_operator;
GRANT SELECT,INSERT,UPDATE ON http_reservation,control.http_origin TO aios_scheduler;
