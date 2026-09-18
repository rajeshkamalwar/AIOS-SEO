SET search_path=aios,pg_catalog;
-- Immutable relation for locally accepted synthetic HTTP receipt/body pairs.
-- This is not a worker-result endpoint or an external-dispatch permission.
CREATE TABLE http_fixture_acceptance (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, attempt_id uuid NOT NULL,
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 body_evidence_id uuid, receipt_evidence_id uuid NOT NULL, observation_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,attempt_id,site_id), UNIQUE(tenant_id,observation_id),
 FOREIGN KEY(tenant_id,site_id,body_evidence_id) REFERENCES evidence(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,receipt_evidence_id) REFERENCES evidence(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,observation_id) REFERENCES observation(tenant_id,site_id,id),
 CHECK(body_evidence_id IS NULL OR body_evidence_id<>receipt_evidence_id)
);
ALTER TABLE http_fixture_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE http_fixture_acceptance FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON http_fixture_acceptance USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER immutable_http_fixture_acceptance BEFORE UPDATE OR DELETE ON http_fixture_acceptance FOR EACH ROW EXECUTE FUNCTION reject_mutation();
GRANT SELECT,INSERT ON http_fixture_acceptance TO aios_runtime;
GRANT SELECT ON http_fixture_acceptance TO aios_scheduler,aios_evaluator,aios_operator;
