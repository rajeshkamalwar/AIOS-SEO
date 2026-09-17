CREATE SCHEMA aios;
REVOKE ALL ON SCHEMA aios FROM PUBLIC;
GRANT USAGE ON SCHEMA aios TO aios_runtime;
SET search_path = aios, pg_catalog;
CREATE FUNCTION tenant_scope() RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT nullif(current_setting('app.tenant_id',true),'')::uuid $$;
CREATE FUNCTION user_scope() RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT nullif(current_setting('app.user_id',true),'')::uuid $$;
CREATE TABLE tenant (
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
  name text NOT NULL,
  policy_profile_id text NOT NULL,
  deletion_epoch bigint NOT NULL,
  PRIMARY KEY (id),
  CHECK (record_type = 'Tenant'),
  CHECK (schema_version = 1),
  CHECK (version >= 1),
  CHECK (state IN ('active','suspended','deleting')),
  CHECK (retention_class = 'identity'),
  CHECK (length(name) BETWEEN 1 AND 4096),
  CHECK (length(policy_profile_id) BETWEEN 1 AND 4096),
  CHECK (deletion_epoch >= 0)
);
CREATE TABLE app_user (
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
  issuer text NOT NULL,
  subject text NOT NULL,
  display_name text,
  PRIMARY KEY (id),
  CHECK (record_type = 'User'),
  CHECK (schema_version = 1),
  CHECK (version >= 1),
  CHECK (state IN ('active','disabled')),
  CHECK (retention_class = 'identity'),
  CHECK (length(issuer) BETWEEN 1 AND 4096),
  CHECK (length(subject) BETWEEN 1 AND 4096),
  CHECK (length(display_name) BETWEEN 1 AND 4096)
);
CREATE TABLE membership (
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
  user_id uuid NOT NULL,
  role text NOT NULL,
  all_sites boolean NOT NULL,
  knowledge_seq bigint NOT NULL,
  PRIMARY KEY (tenant_id,id),
  CHECK (record_type = 'Membership'),
  CHECK (schema_version = 1),
  CHECK (version >= 1),
  CHECK (state IN ('active','revoked')),
  CHECK (retention_class = 'identity'),
  CHECK (role IN ('owner','editor','viewer','expert')),
  CHECK (knowledge_seq >= 1),
  CHECK (knowledge_seq <= 9007199254740991),
  UNIQUE (tenant_id,user_id),
  FOREIGN KEY (user_id) REFERENCES app_user(id),
  FOREIGN KEY (tenant_id) REFERENCES tenant(id)
);
CREATE TABLE site (
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
  business_id uuid,
  submitted_url text NOT NULL,
  normalized_origin text NOT NULL,
  normalization_version text NOT NULL,
  origins text[] NOT NULL,
  knowledge_seq bigint NOT NULL,
  PRIMARY KEY (tenant_id,id),
  CHECK (record_type = 'Site'),
  CHECK (schema_version = 1),
  CHECK (version >= 1),
  CHECK (state IN ('provisional','observed','archived')),
  CHECK (retention_class = 'identity'),
  CHECK (length(submitted_url) BETWEEN 1 AND 4096),
  CHECK (length(normalized_origin) BETWEEN 1 AND 4096),
  CHECK (normalization_version = 'url-v1'),
  CHECK (knowledge_seq >= 1),
  CHECK (knowledge_seq <= 9007199254740991),
  UNIQUE (tenant_id,normalized_origin),
  CHECK (site_id=id),
  CHECK (business_id IS NULL),
  FOREIGN KEY (tenant_id) REFERENCES tenant(id)
);
CREATE TABLE evidence (
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
  artifact_key text NOT NULL,
  sha256 text NOT NULL,
  mime_type text NOT NULL,
  bytes bigint NOT NULL,
  captured_at timestamptz NOT NULL,
  source_uri text NOT NULL,
  source_class text NOT NULL CHECK (source_class IN ('normative_official','first_party_observation','experiment','external_research','model_inference','internal_policy')),
  locator text NOT NULL,
  redaction_version text NOT NULL,
  expires_at timestamptz NOT NULL,
  knowledge_seq bigint NOT NULL,
  PRIMARY KEY (tenant_id,id),
  CHECK (record_type = 'Evidence'),
  CHECK (schema_version = 1),
  CHECK (version >= 1),
  CHECK (state IN ('available','redacted','expired')),
  CHECK (retention_class = 'raw'),
  CHECK (length(artifact_key) BETWEEN 1 AND 4096),
  CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (length(mime_type) BETWEEN 1 AND 4096),
  CHECK (bytes >= 0),
  CHECK (length(source_uri) BETWEEN 1 AND 4096),
  CHECK (length(locator) BETWEEN 1 AND 4096),
  CHECK (length(redaction_version) BETWEEN 1 AND 4096),
  CHECK (knowledge_seq >= 1),
  CHECK (knowledge_seq <= 9007199254740991),
  UNIQUE (tenant_id,site_id,id),
  CHECK (bytes <= 5242880),
  CHECK (expires_at > captured_at),
  FOREIGN KEY (tenant_id) REFERENCES tenant(id),
  FOREIGN KEY (tenant_id,site_id) REFERENCES site(tenant_id,id)
);
CREATE TABLE observation (
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
  sensor_id text NOT NULL,
  sensor_version text NOT NULL,
  subject_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  window_start timestamptz,
  window_end timestamptz,
  source_timezone text NOT NULL,
  context_hash text NOT NULL,
  fresh_until timestamptz NOT NULL,
  attempt_id uuid NOT NULL,
  error jsonb,
  knowledge_seq bigint NOT NULL,
  PRIMARY KEY (tenant_id,id),
  CHECK (record_type = 'Observation'),
  CHECK (schema_version = 1),
  CHECK (version >= 1),
  CHECK (state IN ('observed','partial','failed','not_observed')),
  CHECK (retention_class = 'raw'),
  CHECK (length(sensor_id) BETWEEN 1 AND 4096),
  CHECK (length(sensor_version) BETWEEN 1 AND 4096),
  CHECK (length(source_timezone) BETWEEN 1 AND 4096),
  CHECK (context_hash ~ '^[a-f0-9]{64}$'),
  CHECK (knowledge_seq >= 1),
  CHECK (knowledge_seq <= 9007199254740991),
  UNIQUE (tenant_id,attempt_id,subject_id),
  CHECK (fresh_until >= observed_at),
  FOREIGN KEY (tenant_id) REFERENCES tenant(id),
  FOREIGN KEY (tenant_id,site_id) REFERENCES site(tenant_id,id)
);
CREATE TABLE evidence_bundle (
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
  known_at timestamptz NOT NULL,
  manifest_hash text NOT NULL,
  knowledge_seq bigint NOT NULL,
  known_seq bigint NOT NULL,
  PRIMARY KEY (tenant_id,id),
  CHECK (record_type = 'EvidenceBundle'),
  CHECK (schema_version = 1),
  CHECK (version >= 1),
  CHECK (state IN ('frozen')),
  CHECK (retention_class = 'derived'),
  CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  CHECK (knowledge_seq >= 1),
  CHECK (knowledge_seq <= 9007199254740991),
  CHECK (known_seq >= 0),
  CHECK (known_seq <= 9007199254740991),
  FOREIGN KEY (tenant_id) REFERENCES tenant(id),
  FOREIGN KEY (tenant_id,site_id) REFERENCES site(tenant_id,id)
);
CREATE TABLE knowledge_clock (tenant_id uuid PRIMARY KEY REFERENCES tenant(id), seq bigint NOT NULL CHECK(seq BETWEEN 0 AND 9007199254740991), recorded_at timestamptz NOT NULL);
CREATE TABLE knowledge_commit (tenant_id uuid NOT NULL REFERENCES tenant(id), seq bigint NOT NULL, recorded_at timestamptz NOT NULL, PRIMARY KEY(tenant_id,seq));
CREATE TABLE record_index (tenant_id uuid NOT NULL REFERENCES tenant(id), id uuid NOT NULL, record_type text NOT NULL, site_id uuid, created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(), PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,id,record_type), UNIQUE(tenant_id,site_id,id), FOREIGN KEY(tenant_id,site_id) REFERENCES site(tenant_id,id) DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE record_link (tenant_id uuid NOT NULL, owner_id uuid NOT NULL, field_name text NOT NULL, ordinal integer NOT NULL CHECK(ordinal>=0), target_id uuid NOT NULL, target_type text NOT NULL, PRIMARY KEY(tenant_id,owner_id,field_name,ordinal), UNIQUE(tenant_id,owner_id,field_name,target_id), FOREIGN KEY(tenant_id,owner_id) REFERENCES record_index(tenant_id,id), FOREIGN KEY(tenant_id,target_id,target_type) REFERENCES record_index(tenant_id,id,record_type));
CREATE FUNCTION index_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=aios,pg_catalog AS $$ BEGIN
 INSERT INTO record_index(tenant_id,id,record_type,site_id) VALUES(NEW.tenant_id,NEW.id,NEW.record_type,CASE WHEN NEW.record_type='Membership' THEN NULL ELSE (to_jsonb(NEW)->>'site_id')::uuid END);
 RETURN NEW; END $$;
CREATE FUNCTION guard_link() RETURNS trigger LANGUAGE plpgsql SET search_path=aios,pg_catalog AS $$ DECLARE o record; t record; BEGIN
 SELECT * INTO STRICT o FROM record_index WHERE tenant_id=NEW.tenant_id AND id=NEW.owner_id;
 SELECT * INTO STRICT t FROM record_index WHERE tenant_id=NEW.tenant_id AND id=NEW.target_id;
 IF current_user='aios_runtime' AND o.record_type='Membership' THEN RAISE EXCEPTION 'scope_denied'; END IF;
 IF o.record_type IN ('Evidence','Observation','EvidenceBundle') AND o.created_xid<>pg_current_xact_id() THEN RAISE EXCEPTION 'immutable_reference_set'; END IF;
 IF o.site_id IS NOT NULL AND o.site_id IS DISTINCT FROM t.site_id THEN RAISE EXCEPTION 'scope_denied'; END IF;
 IF NOT ((NEW.field_name='provenance_ids' AND NEW.target_type IN ('Evidence','Observation','EvidenceBundle'))
 OR (o.record_type='Membership' AND NEW.field_name='site_scope_ids' AND NEW.target_type='Site')
 OR (o.record_type IN ('Observation','EvidenceBundle') AND NEW.field_name='evidence_ids' AND NEW.target_type='Evidence')
 OR (o.record_type='EvidenceBundle' AND NEW.field_name='observation_ids' AND NEW.target_type='Observation'))
 THEN RAISE EXCEPTION 'invalid_reference'; END IF; RETURN NEW; END $$;
CREATE TRIGGER validate_link BEFORE INSERT ON record_link FOR EACH ROW EXECUTE FUNCTION guard_link();
ALTER TABLE observation ADD FOREIGN KEY(tenant_id,subject_id) REFERENCES record_index(tenant_id,id);
CREATE TABLE acceptance (tenant_id uuid NOT NULL, site_id uuid NOT NULL, attempt_id uuid NOT NULL, subject_id uuid NOT NULL, input_hash text NOT NULL, evidence_id uuid NOT NULL, observation_id uuid NOT NULL, PRIMARY KEY(tenant_id,attempt_id,subject_id), FOREIGN KEY(tenant_id,site_id,evidence_id) REFERENCES evidence(tenant_id,site_id,id), FOREIGN KEY(tenant_id,observation_id) REFERENCES observation(tenant_id,id));
CREATE TABLE outbox (tenant_id uuid NOT NULL, site_id uuid NOT NULL, event_id uuid NOT NULL, aggregate_id uuid NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL, recorded_at timestamptz NOT NULL, dispatched_at timestamptz, PRIMARY KEY(tenant_id,event_id), FOREIGN KEY(tenant_id,site_id) REFERENCES site(tenant_id,id), FOREIGN KEY(tenant_id,aggregate_id) REFERENCES record_index(tenant_id,id));
CREATE TABLE inbox (tenant_id uuid NOT NULL, consumer text NOT NULL, event_id uuid NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,consumer,event_id), FOREIGN KEY(tenant_id,event_id) REFERENCES outbox(tenant_id,event_id));
CREATE TABLE evidence_projection (tenant_id uuid NOT NULL, event_id uuid NOT NULL, evidence_id uuid NOT NULL, PRIMARY KEY(tenant_id,event_id), FOREIGN KEY(tenant_id,event_id) REFERENCES outbox(tenant_id,event_id), FOREIGN KEY(tenant_id,evidence_id) REFERENCES evidence(tenant_id,id));
CREATE INDEX pending_outbox ON outbox(recorded_at) WHERE dispatched_at IS NULL;
CREATE INDEX evidence_site_time ON evidence(tenant_id,site_id,recorded_at);
CREATE INDEX observation_site_time ON observation(tenant_id,site_id,recorded_at);
CREATE INDEX links_target ON record_link(tenant_id,target_id);
CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=aios,pg_catalog AS $$ BEGIN RAISE EXCEPTION 'immutable_record'; END $$;

CREATE TRIGGER index_membership AFTER INSERT ON membership FOR EACH ROW EXECUTE FUNCTION index_record();
CREATE TRIGGER index_site AFTER INSERT ON site FOR EACH ROW EXECUTE FUNCTION index_record();
CREATE TRIGGER index_evidence AFTER INSERT ON evidence FOR EACH ROW EXECUTE FUNCTION index_record();
CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON evidence FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER index_observation AFTER INSERT ON observation FOR EACH ROW EXECUTE FUNCTION index_record();
CREATE TRIGGER immutable_observation BEFORE UPDATE OR DELETE ON observation FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER index_evidence_bundle AFTER INSERT ON evidence_bundle FOR EACH ROW EXECUTE FUNCTION index_record();
CREATE TRIGGER immutable_evidence_bundle BEFORE UPDATE OR DELETE ON evidence_bundle FOR EACH ROW EXECUTE FUNCTION reject_mutation();
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON tenant USING (id=tenant_scope()) WITH CHECK (id=tenant_scope());
GRANT SELECT ON tenant TO aios_runtime;
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY; ALTER TABLE app_user FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON app_user USING (id=user_scope()) WITH CHECK (id=user_scope());
GRANT SELECT ON app_user TO aios_runtime;
ALTER TABLE membership ENABLE ROW LEVEL SECURITY; ALTER TABLE membership FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON membership USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON membership TO aios_runtime;
ALTER TABLE site ENABLE ROW LEVEL SECURITY; ALTER TABLE site FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON site USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON site TO aios_runtime;
GRANT INSERT ON site TO aios_runtime;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY; ALTER TABLE evidence FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON evidence USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON evidence TO aios_runtime;
GRANT INSERT ON evidence TO aios_runtime;
ALTER TABLE observation ENABLE ROW LEVEL SECURITY; ALTER TABLE observation FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON observation USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON observation TO aios_runtime;
GRANT INSERT ON observation TO aios_runtime;
ALTER TABLE evidence_bundle ENABLE ROW LEVEL SECURITY; ALTER TABLE evidence_bundle FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON evidence_bundle USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON evidence_bundle TO aios_runtime;
GRANT INSERT ON evidence_bundle TO aios_runtime;
ALTER TABLE knowledge_clock ENABLE ROW LEVEL SECURITY; ALTER TABLE knowledge_clock FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON knowledge_clock USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON knowledge_clock TO aios_runtime;
GRANT INSERT ON knowledge_clock TO aios_runtime;
ALTER TABLE knowledge_commit ENABLE ROW LEVEL SECURITY; ALTER TABLE knowledge_commit FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON knowledge_commit USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON knowledge_commit TO aios_runtime;
GRANT INSERT ON knowledge_commit TO aios_runtime;
ALTER TABLE record_index ENABLE ROW LEVEL SECURITY; ALTER TABLE record_index FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON record_index USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON record_index TO aios_runtime;
GRANT INSERT ON record_index TO aios_runtime;
ALTER TABLE record_link ENABLE ROW LEVEL SECURITY; ALTER TABLE record_link FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON record_link USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON record_link TO aios_runtime;
GRANT INSERT ON record_link TO aios_runtime;
ALTER TABLE acceptance ENABLE ROW LEVEL SECURITY; ALTER TABLE acceptance FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON acceptance USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON acceptance TO aios_runtime;
GRANT INSERT ON acceptance TO aios_runtime;
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY; ALTER TABLE outbox FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON outbox USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON outbox TO aios_runtime;
GRANT INSERT ON outbox TO aios_runtime;
ALTER TABLE inbox ENABLE ROW LEVEL SECURITY; ALTER TABLE inbox FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON inbox USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON inbox TO aios_runtime;
GRANT INSERT ON inbox TO aios_runtime;
ALTER TABLE evidence_projection ENABLE ROW LEVEL SECURITY; ALTER TABLE evidence_projection FORCE ROW LEVEL SECURITY; CREATE POLICY scoped ON evidence_projection USING (tenant_id=tenant_scope()) WITH CHECK (tenant_id=tenant_scope());
GRANT SELECT ON evidence_projection TO aios_runtime;
GRANT INSERT ON evidence_projection TO aios_runtime;
GRANT UPDATE ON knowledge_clock TO aios_runtime;
GRANT UPDATE(dispatched_at) ON outbox TO aios_runtime;
CREATE FUNCTION authorize(mode text, wanted_site uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=aios,pg_catalog AS $$ DECLARE m membership%ROWTYPE; BEGIN
 PERFORM 1 FROM tenant WHERE id=tenant_scope() AND state='active' AND policy_profile_id='local-synthetic-v1' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_denied'; END IF;
 PERFORM 1 FROM app_user WHERE id=user_scope() AND state='active' AND issuer='test:fixture' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_denied'; END IF;
 SELECT * INTO m FROM membership WHERE tenant_id=tenant_scope() AND user_id=user_scope() AND state='active' FOR SHARE;
 IF NOT FOUND OR mode NOT IN ('read','write','expert') THEN RAISE EXCEPTION 'scope_denied'; END IF;
 IF mode='write' AND m.role NOT IN ('owner','editor') THEN RAISE EXCEPTION 'scope_denied'; END IF;
 IF mode='expert' AND m.role NOT IN ('owner','expert') THEN RAISE EXCEPTION 'scope_denied'; END IF;
 IF NOT m.all_sites AND (wanted_site IS NULL OR NOT EXISTS(SELECT 1 FROM record_link WHERE tenant_id=m.tenant_id AND owner_id=m.id AND field_name='site_scope_ids' AND target_id=wanted_site)) THEN RAISE EXCEPTION 'scope_denied'; END IF;
 IF wanted_site IS NOT NULL AND NOT EXISTS(SELECT 1 FROM site WHERE tenant_id=m.tenant_id AND id=wanted_site AND state<>'archived') THEN RAISE EXCEPTION 'scope_denied'; END IF;
END $$;
REVOKE ALL ON FUNCTION authorize(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION authorize(text,uuid) TO aios_runtime;


ALTER TABLE evidence ADD CHECK (artifact_key=tenant_id::text || '/' || site_id::text || '/' || id::text);
ALTER TABLE observation ADD FOREIGN KEY(tenant_id,site_id,subject_id) REFERENCES record_index(tenant_id,site_id,id);
ALTER TABLE outbox ADD FOREIGN KEY(tenant_id,site_id,aggregate_id) REFERENCES record_index(tenant_id,site_id,id);

ALTER TABLE app_user ADD UNIQUE(issuer,subject);
REVOKE INSERT ON record_index FROM aios_runtime;
