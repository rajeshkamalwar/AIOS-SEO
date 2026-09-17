SET search_path=aios,pg_catalog;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='aios_scheduler') THEN CREATE ROLE aios_scheduler NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='aios_evaluator') THEN CREATE ROLE aios_evaluator NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='aios_operator') THEN CREATE ROLE aios_operator NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA aios TO aios_scheduler,aios_evaluator,aios_operator;
GRANT EXECUTE ON FUNCTION authorize(text,uuid) TO aios_scheduler,aios_evaluator,aios_operator;
CREATE SCHEMA control;
REVOKE ALL ON SCHEMA control FROM PUBLIC;
GRANT USAGE ON SCHEMA control TO aios_runtime,aios_scheduler,aios_evaluator,aios_operator;
CREATE TABLE control.release (
 digest text PRIMARY KEY CHECK(digest ~ '^[a-f0-9]{64}$'), skill_id text NOT NULL, semver text NOT NULL,
 manifest jsonb NOT NULL, approval jsonb NOT NULL, signature text NOT NULL, profile text NOT NULL CHECK(profile='local-synthetic-v1'),
 fresh_until timestamptz NOT NULL, UNIQUE(skill_id,semver)
);
CREATE TABLE control.release_dependency (digest text REFERENCES control.release, dependency text REFERENCES control.release,
 PRIMARY KEY(digest,dependency), CHECK(digest<>dependency));
CREATE TABLE control.release_state (digest text REFERENCES control.release, generation bigint NOT NULL CHECK(generation>0),
 status text NOT NULL CHECK(status IN ('approved','deprecated','revoked')), effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL, PRIMARY KEY(digest,generation));
CREATE TABLE control.authority_key (reviewer uuid PRIMARY KEY, public_key text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE control.scheduler_turn (tenant_id uuid PRIMARY KEY, last_dispatch bigint NOT NULL DEFAULT 0);
CREATE SEQUENCE control.dispatch_turn;
CREATE TABLE control.health (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), policy_version text NOT NULL CHECK(policy_version='discovery-v1'), verified_until timestamptz NOT NULL, restore_ready boolean NOT NULL DEFAULT false);
INSERT INTO control.health VALUES(true,'discovery-v1','-infinity',false);
CREATE TABLE control.tenant_cap (tenant_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('http_requests','render_requests','render_pages','model_calls','tokens','cost_microusd')), amount bigint NOT NULL CHECK(amount BETWEEN 0 AND 9007199254740991), PRIMARY KEY(tenant_id,kind));
CREATE TABLE crawl (
  record_type text NOT NULL,
  id uuid NOT NULL,
  schema_version bigint NOT NULL,
  version bigint NOT NULL,
  created_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  state text NOT NULL,
  retention_class text NOT NULL,
  tenant_id uuid NOT NULL,
  site_id uuid NOT NULL,
  submitted_by uuid NOT NULL,
  policy_version text NOT NULL,
  input_hash text NOT NULL,
  idempotency_key text NOT NULL,
  stage text NOT NULL,
  budget jsonb NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  completion_reason text,
  knowledge_seq bigint NOT NULL,
  PRIMARY KEY(tenant_id,id),
  UNIQUE(tenant_id,site_id,id),
  FOREIGN KEY(tenant_id,site_id) REFERENCES site(tenant_id,id),
  CHECK (record_type='Crawl'),
  CHECK (schema_version=1),
  CHECK (version>=1),
  CHECK (state IN ('queued','running','complete_in_scope','partial','blocked','failed','cancelled')),
  CHECK (retention_class='operations'),
  CHECK (policy_version='discovery-v1'),
  CHECK (stage IN ('validating','discovering','collecting','analyzing','auditing','published')),
  CHECK (knowledge_seq>=1),
  CHECK (knowledge_seq<=9007199254740991),
  UNIQUE(tenant_id,idempotency_key),
  FOREIGN KEY(submitted_by) REFERENCES app_user(id)
);
CREATE UNIQUE INDEX one_active_site ON crawl(tenant_id,site_id) WHERE state='running';
CREATE TABLE work_fence (tenant_id uuid NOT NULL, site_id uuid NOT NULL, crawl_id uuid NOT NULL,
 deletion_epoch bigint NOT NULL, quarantined boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,crawl_id), FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id));
CREATE TABLE job (
 tenant_id uuid NOT NULL, site_id uuid NOT NULL, crawl_id uuid NOT NULL, job_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('crawl','fetch','render','infer','evaluate','project','audit','delete')),
 state text NOT NULL CHECK(state IN ('queued','leased','retry_wait','completed','failed','dead_letter','cancelled')),
 input_ref uuid NOT NULL, expected_input_hash text NOT NULL CHECK(expected_input_hash ~ '^[a-f0-9]{64}$'), idempotency_key text NOT NULL,
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 3), max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts=3),
 available_at timestamptz NOT NULL, deadline timestamptz NOT NULL, lease_until timestamptz, lease_token uuid, error jsonb,
 release_digest text NOT NULL REFERENCES control.release(digest), release_generation bigint NOT NULL, result_ref uuid,
 PRIMARY KEY(tenant_id,job_id), UNIQUE(tenant_id,crawl_id,idempotency_key), UNIQUE(tenant_id,site_id,job_id),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,input_ref) REFERENCES record_index(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,result_ref) REFERENCES record_index(tenant_id,site_id,id),
 CHECK((state='leased' AND lease_token IS NOT NULL AND lease_until IS NOT NULL AND attempt>0) OR (state<>'leased' AND lease_token IS NULL AND lease_until IS NULL))
);
CREATE INDEX job_claim ON job(state,available_at,deadline);
CREATE TABLE job_attempt (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, attempt_no integer NOT NULL, attempt_id uuid NOT NULL,
 started_at timestamptz NOT NULL, ended_at timestamptz, outcome text, input_hash text NOT NULL,
 PRIMARY KEY(tenant_id,job_id,attempt_no), UNIQUE(tenant_id,attempt_id), FOREIGN KEY(tenant_id,job_id) REFERENCES job(tenant_id,job_id)
);
CREATE TABLE budget_reservation (
 tenant_id uuid NOT NULL, crawl_id uuid NOT NULL, job_id uuid NOT NULL, attempt_no integer NOT NULL,
 reservation_id uuid NOT NULL, kind text NOT NULL, amount bigint NOT NULL CHECK(amount>=0), actual bigint CHECK(actual BETWEEN 0 AND amount),
 state text NOT NULL CHECK(state IN ('reserved','settled')), receipt_hash text,
 PRIMARY KEY(tenant_id,reservation_id), FOREIGN KEY(tenant_id,job_id,attempt_no) REFERENCES job_attempt(tenant_id,job_id,attempt_no),
 FOREIGN KEY(tenant_id,kind) REFERENCES control.tenant_cap(tenant_id,kind),
 CHECK((state='reserved' AND actual IS NULL AND receipt_hash IS NULL) OR (state='settled' AND actual IS NOT NULL AND receipt_hash IS NOT NULL))
);
CREATE TABLE job_release (tenant_id uuid NOT NULL, job_id uuid NOT NULL, digest text NOT NULL REFERENCES control.release,
 generation bigint NOT NULL, PRIMARY KEY(tenant_id,job_id,digest), FOREIGN KEY(tenant_id,job_id) REFERENCES job(tenant_id,job_id));
CREATE TABLE self_audit_result (
  record_type text NOT NULL,
  id uuid NOT NULL,
  schema_version bigint NOT NULL,
  version bigint NOT NULL,
  created_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  state text NOT NULL,
  retention_class text NOT NULL,
  tenant_id uuid NOT NULL,
  site_id uuid NOT NULL,
  crawl_id uuid NOT NULL,
  check_id text NOT NULL,
  check_version text NOT NULL,
  result text NOT NULL,
  effect text NOT NULL,
  reason text NOT NULL,
  knowledge_seq bigint NOT NULL,
  scope text NOT NULL,
  scope_complete boolean NOT NULL,
  dependency_snapshot_hash text NOT NULL,
  recovery_of_id uuid,
  PRIMARY KEY(tenant_id,id),
  UNIQUE(tenant_id,site_id,id),
  FOREIGN KEY(tenant_id,site_id) REFERENCES site(tenant_id,id),
  CHECK (record_type='SelfAuditResult'),
  CHECK (schema_version=2),
  CHECK (version>=1),
  CHECK (state IN ('recorded')),
  CHECK (retention_class='audit'),
  CHECK (result IN ('pass','fail','unknown','not_applicable')),
  CHECK (effect IN ('allow','degrade','reject_outputs','quarantine_run')),
  CHECK (knowledge_seq>=1),
  CHECK (knowledge_seq<=9007199254740991),
  CHECK (scope IN ('outputs','run')),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,recovery_of_id) REFERENCES self_audit_result(tenant_id,site_id,id)
);
CREATE TABLE audit_output (tenant_id uuid NOT NULL, site_id uuid NOT NULL, crawl_id uuid NOT NULL, output_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,crawl_id,output_id), FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,output_id) REFERENCES record_index(tenant_id,site_id,id));
CREATE TABLE audit_dependency (tenant_id uuid NOT NULL, crawl_id uuid NOT NULL, output_id uuid NOT NULL, depends_on uuid NOT NULL,
 PRIMARY KEY(tenant_id,crawl_id,output_id,depends_on), FOREIGN KEY(tenant_id,crawl_id,output_id) REFERENCES audit_output(tenant_id,crawl_id,output_id),
 FOREIGN KEY(tenant_id,crawl_id,depends_on) REFERENCES audit_output(tenant_id,crawl_id,output_id));
CREATE TABLE audit_scope (tenant_id uuid NOT NULL, crawl_id uuid NOT NULL, complete boolean NOT NULL DEFAULT false, sealed boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,crawl_id), FOREIGN KEY(tenant_id,crawl_id) REFERENCES crawl(tenant_id,id));
CREATE TABLE audit_impact (tenant_id uuid NOT NULL, site_id uuid NOT NULL, receipt_id uuid NOT NULL, output_id uuid NOT NULL, direct boolean NOT NULL,
 PRIMARY KEY(tenant_id,receipt_id,output_id), FOREIGN KEY(tenant_id,site_id,receipt_id) REFERENCES self_audit_result(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,output_id) REFERENCES record_index(tenant_id,site_id,id));
CREATE TABLE audit_recovery (tenant_id uuid NOT NULL, receipt_id uuid NOT NULL, passing_receipt_id uuid NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,receipt_id), FOREIGN KEY(tenant_id,receipt_id) REFERENCES self_audit_result(tenant_id,id),
 FOREIGN KEY(tenant_id,passing_receipt_id) REFERENCES self_audit_result(tenant_id,id));
CREATE TABLE work_audit (tenant_id uuid NOT NULL, site_id uuid NOT NULL, id uuid PRIMARY KEY, crawl_id uuid NOT NULL,
 operation text NOT NULL, actor_role text NOT NULL DEFAULT current_user, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id));
CREATE TABLE deletion_fence (tenant_id uuid NOT NULL, site_id uuid NOT NULL, epoch bigint NOT NULL CHECK(epoch>0), requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,site_id));
ALTER TABLE crawl ENABLE ROW LEVEL SECURITY; ALTER TABLE crawl FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON crawl USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE work_fence ENABLE ROW LEVEL SECURITY; ALTER TABLE work_fence FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON work_fence USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE job ENABLE ROW LEVEL SECURITY; ALTER TABLE job FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON job USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE job_attempt ENABLE ROW LEVEL SECURITY; ALTER TABLE job_attempt FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON job_attempt USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE budget_reservation ENABLE ROW LEVEL SECURITY; ALTER TABLE budget_reservation FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON budget_reservation USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE job_release ENABLE ROW LEVEL SECURITY; ALTER TABLE job_release FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON job_release USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE self_audit_result ENABLE ROW LEVEL SECURITY; ALTER TABLE self_audit_result FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON self_audit_result USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE audit_output ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_output FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON audit_output USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE audit_dependency ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_dependency FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON audit_dependency USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE audit_scope ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_scope FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON audit_scope USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE audit_impact ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_impact FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON audit_impact USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE audit_recovery ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_recovery FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON audit_recovery USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE work_audit ENABLE ROW LEVEL SECURITY; ALTER TABLE work_audit FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON work_audit USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE deletion_fence ENABLE ROW LEVEL SECURITY; ALTER TABLE deletion_fence FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON deletion_fence USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER index_crawl AFTER INSERT ON crawl FOR EACH ROW EXECUTE FUNCTION index_record();
CREATE TRIGGER index_self_audit_result AFTER INSERT ON self_audit_result FOR EACH ROW EXECUTE FUNCTION index_record();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON self_audit_result FOR EACH ROW EXECUTE FUNCTION aios.reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON audit_impact FOR EACH ROW EXECUTE FUNCTION aios.reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON audit_recovery FOR EACH ROW EXECUTE FUNCTION aios.reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON work_audit FOR EACH ROW EXECUTE FUNCTION aios.reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON control.release FOR EACH ROW EXECUTE FUNCTION aios.reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON control.release_dependency FOR EACH ROW EXECUTE FUNCTION aios.reject_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON control.release_state FOR EACH ROW EXECUTE FUNCTION aios.reject_mutation();
GRANT SELECT ON ALL TABLES IN SCHEMA control TO aios_runtime,aios_scheduler,aios_evaluator,aios_operator;
GRANT INSERT ON control.release,control.release_dependency,control.release_state TO aios_operator;
GRANT INSERT,UPDATE ON control.authority_key,control.health,control.tenant_cap TO aios_operator;
GRANT INSERT,UPDATE ON control.scheduler_turn TO aios_scheduler;
GRANT USAGE ON SEQUENCE control.dispatch_turn TO aios_scheduler;
GRANT SELECT ON ALL TABLES IN SCHEMA aios TO aios_scheduler,aios_evaluator,aios_operator;
GRANT SELECT ON crawl,job,work_fence,self_audit_result,audit_impact,audit_recovery TO aios_runtime;
GRANT INSERT ON crawl,work_fence,job,job_release,audit_scope,work_audit TO aios_runtime;
GRANT UPDATE ON crawl,job TO aios_runtime;
GRANT INSERT,UPDATE ON job,job_attempt,budget_reservation TO aios_scheduler;
GRANT UPDATE ON crawl TO aios_scheduler;
GRANT INSERT ON work_audit TO aios_scheduler,aios_evaluator,aios_operator;
GRANT INSERT,UPDATE ON knowledge_clock TO aios_scheduler,aios_evaluator;
GRANT INSERT ON knowledge_commit,outbox TO aios_scheduler,aios_evaluator;
GRANT INSERT ON self_audit_result,audit_impact,audit_output,audit_dependency TO aios_evaluator;
GRANT UPDATE ON audit_scope,work_fence TO aios_evaluator;
GRANT INSERT ON audit_recovery,deletion_fence TO aios_operator;
GRANT UPDATE ON tenant,site,work_fence,crawl,job TO aios_operator;
-- Scheduling sees identifiers/status only across tenants; it never reads global evidence.
CREATE POLICY scheduler_queue ON crawl FOR SELECT TO aios_scheduler USING(true);
CREATE POLICY scheduler_jobs ON job FOR SELECT TO aios_scheduler USING(true);

CREATE FUNCTION control.admission_counts(t uuid) RETURNS TABLE(tenant_queued bigint,global_queued bigint) LANGUAGE sql SECURITY DEFINER SET search_path=aios,pg_catalog AS $$ SELECT count(*) FILTER(WHERE tenant_id=t),count(*) FROM crawl WHERE state='queued' $$;
REVOKE ALL ON FUNCTION control.admission_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.admission_counts(uuid) TO aios_runtime;
