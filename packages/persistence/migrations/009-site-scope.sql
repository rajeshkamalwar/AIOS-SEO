SET search_path=aios,pg_catalog;
CREATE TABLE site_scope_acceptance (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, crawl_id uuid NOT NULL,
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 evidence_id uuid NOT NULL, observation_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,crawl_id), UNIQUE(tenant_id,observation_id),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,evidence_id) REFERENCES evidence(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,observation_id) REFERENCES observation(tenant_id,site_id,id)
);
ALTER TABLE site_scope_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_scope_acceptance FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON site_scope_acceptance USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER immutable_site_scope BEFORE UPDATE OR DELETE ON site_scope_acceptance FOR EACH ROW EXECUTE FUNCTION reject_mutation();
GRANT SELECT,INSERT ON site_scope_acceptance TO aios_runtime;
GRANT SELECT ON site_scope_acceptance TO aios_scheduler,aios_evaluator,aios_operator;
