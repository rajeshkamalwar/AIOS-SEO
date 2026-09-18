SET search_path=aios,pg_catalog;
CREATE TABLE http_bootstrap_projection (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,job_id uuid NOT NULL,invocation_id uuid NOT NULL,observation_id uuid NOT NULL,
 receipt_hash text NOT NULL CHECK(receipt_hash ~ '^[a-f0-9]{64}$'),result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=8192),created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
 PRIMARY KEY(tenant_id,job_id),UNIQUE(tenant_id,invocation_id),UNIQUE(tenant_id,observation_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES job(tenant_id,job_id),FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,invocation_id) REFERENCES http_bootstrap_acceptance(tenant_id,invocation_id),FOREIGN KEY(tenant_id,site_id,observation_id) REFERENCES observation(tenant_id,site_id,id)
);
ALTER TABLE http_bootstrap_projection ENABLE ROW LEVEL SECURITY;ALTER TABLE http_bootstrap_projection FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON http_bootstrap_projection USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER immutable_http_bootstrap_projection BEFORE UPDATE OR DELETE ON http_bootstrap_projection FOR EACH ROW EXECUTE FUNCTION reject_mutation();
REVOKE ALL ON http_bootstrap_projection FROM PUBLIC,aios_runtime,aios_scheduler,aios_http_supervisor,aios_http_acceptor;
GRANT SELECT ON http_bootstrap_projection TO aios_scheduler,aios_evaluator;
CREATE OR REPLACE FUNCTION aios.guard_http_bootstrap_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable_http_descriptor';END IF;
 IF TG_TABLE_NAME='http_bootstrap_job' THEN RAISE EXCEPTION 'immutable_http_descriptor';END IF;
 IF TG_OP='UPDATE' AND (OLD.kind='fetch' OR NEW.kind='fetch') AND (OLD.kind,OLD.tenant_id,OLD.site_id,OLD.crawl_id,OLD.job_id,OLD.input_ref,OLD.expected_input_hash,OLD.release_digest,OLD.release_generation,OLD.idempotency_key) IS DISTINCT FROM (NEW.kind,NEW.tenant_id,NEW.site_id,NEW.crawl_id,NEW.job_id,NEW.input_ref,NEW.expected_input_hash,NEW.release_digest,NEW.release_generation,NEW.idempotency_key) THEN RAISE EXCEPTION 'immutable_http_descriptor';END IF;
 IF NEW.kind='fetch' AND (NEW.state='completed' OR NEW.result_ref IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM aios.http_bootstrap_projection p WHERE p.tenant_id=NEW.tenant_id AND p.site_id=NEW.site_id AND p.crawl_id=NEW.crawl_id AND p.job_id=NEW.job_id AND p.observation_id=NEW.result_ref AND NEW.state='completed' AND NEW.lease_token IS NULL AND NEW.lease_until IS NULL AND p.created_xid=pg_current_xact_id()) THEN RAISE EXCEPTION 'handler_not_installed';END IF;
 IF TG_OP='UPDATE' AND OLD.kind='fetch' AND OLD.state='completed' THEN RAISE EXCEPTION 'immutable_http_completion';END IF;
 IF NEW.kind='fetch' AND NOT EXISTS(SELECT 1 FROM aios.http_bootstrap_job WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'http_descriptor_required';END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION control.project_http_bootstrap_fixture(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,receipt_text text,body_bytes bytea,result_json jsonb)
RETURNS SETOF aios.http_bootstrap_projection LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE jobrow aios.job;accepted aios.http_bootstrap_acceptance;h aios.http_reservation;z aios.http_terminal_receipt;i aios.http_invocation;prior aios.http_bootstrap_projection;e aios.evidence;b aios.evidence;o aios.observation;d jsonb;m jsonb;seq bigint;at_time timestamptz;eid uuid;envelope jsonb;expected_state text;expected_reason text;status integer;until_time timestamptz;
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 SELECT * INTO jobrow FROM aios.job WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND kind='fetch' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'lease_lost'; END IF;
 SELECT * INTO accepted FROM aios.http_bootstrap_acceptance WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'source_unavailable'; END IF;
 SELECT * INTO h FROM aios.http_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND invocation_id=accepted.invocation_id AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND settled_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'lease_lost'; END IF;
 SELECT * INTO z FROM aios.http_terminal_receipt WHERE tenant_id=t AND reservation_id=h.reservation_id AND invocation_id=h.invocation_id AND receipt_id=accepted.terminal_receipt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 SELECT * INTO i FROM aios.http_invocation WHERE tenant_id=t AND reservation_id=h.reservation_id AND invocation_id=h.invocation_id;
 IF NOT FOUND OR accepted.input_hash IS DISTINCT FROM encode(sha256(convert_to('{"imageDigest":'||to_json(i.collector_build_digest)::text||',"inputContextHash":'||to_json(i.input_context_hash)::text||',"resultDigest":'||to_json(z.result_digest)::text||',"terminalReceiptId":'||to_json(accepted.terminal_receipt_id::text)::text||'}','UTF8')),'hex') THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 PERFORM control.assert_http_bootstrap_context(t,s,r,j,a,h.origin,h.reserved_bytes);
 SELECT * INTO prior FROM aios.http_bootstrap_projection WHERE tenant_id=t AND job_id=j;
 IF FOUND THEN
  IF jobrow.state<>'completed' OR jobrow.result_ref<>accepted.observation_id OR prior.observation_id<>accepted.observation_id OR prior.invocation_id<>h.invocation_id OR prior.result IS DISTINCT FROM result_json THEN RAISE EXCEPTION 'conflict'; END IF;
 ELSE
  IF jobrow.state<>'leased' OR jobrow.attempt<>a OR jobrow.lease_token IS DISTINCT FROM tok OR jobrow.lease_until<=clock_timestamp() OR jobrow.deadline<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM aios.job_attempt WHERE tenant_id=t AND job_id=j AND attempt_no=a AND attempt_id=aid) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 END IF;
 SELECT descriptor INTO d FROM aios.http_bootstrap_job WHERE tenant_id=t AND job_id=j;
 SELECT * INTO e FROM aios.evidence WHERE tenant_id=t AND site_id=s AND id=accepted.receipt_evidence_id AND state='available' AND deleted_at IS NULL AND expires_at>clock_timestamp() AND mime_type='application/json' AND source_class='first_party_observation' AND redaction_version='none-v1';
 IF NOT FOUND OR octet_length(receipt_text)>32768 OR e.sha256 IS DISTINCT FROM encode(sha256(convert_to(receipt_text,'UTF8')),'hex') OR e.bytes<>octet_length(receipt_text) THEN RAISE EXCEPTION 'artifact_integrity_failed'; END IF;
 SELECT * INTO o FROM aios.observation WHERE tenant_id=t AND site_id=s AND id=accepted.observation_id AND state IN ('observed','partial','failed') AND deleted_at IS NULL AND fresh_until>clock_timestamp() AND observed_at>clock_timestamp()-interval '24 hours' AND subject_id=s AND sensor_id='http-fixture' AND sensor_version='1.0.0' AND attempt_id=h.invocation_id AND context_hash=e.sha256;
 IF NOT FOUND THEN RAISE EXCEPTION 'source_unavailable'; END IF;
 m:=receipt_text::jsonb;
 IF m->>'body_evidence_id' IS DISTINCT FROM accepted.body_evidence_id::text OR m->>'url' IS DISTINCT FROM d->>'url' OR m->>'final_url' IS DISTINCT FROM d->>'url' OR m->>'method' IS DISTINCT FROM 'GET' OR o.state IS DISTINCT FROM (CASE WHEN m->'status_code'='null'::jsonb THEN 'failed' WHEN m->'error'<>'null'::jsonb OR (m->>'truncated')::boolean THEN 'partial' ELSE 'observed' END) OR o.error IS DISTINCT FROM NULLIF(m->'error','null'::jsonb) OR e.source_uri IS DISTINCT FROM d->>'url' OR e.captured_at<>o.observed_at OR e.captured_at NOT BETWEEN z.started_at AND z.finished_at THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 until_time:=least(o.fresh_until,e.expires_at,o.observed_at+interval '24 hours');
 IF accepted.body_evidence_id IS NULL THEN
  IF body_bytes IS NOT NULL THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 ELSE
  SELECT * INTO b FROM aios.evidence WHERE tenant_id=t AND site_id=s AND id=accepted.body_evidence_id AND state='available' AND deleted_at IS NULL AND expires_at>clock_timestamp() AND redaction_version='none-v1';
  IF NOT FOUND OR body_bytes IS NULL OR octet_length(body_bytes)>512000 OR b.bytes<>octet_length(body_bytes) OR b.sha256 IS DISTINCT FROM encode(sha256(body_bytes),'hex') OR b.source_class IS DISTINCT FROM 'first_party_observation' OR b.mime_type IS DISTINCT FROM (SELECT lower(btrim(split_part(value->>'value',';',1))) FROM jsonb_array_elements(m->'headers') WHERE value->>'name'='content-type') OR b.source_uri IS DISTINCT FROM d->>'url' OR b.captured_at<>e.captured_at THEN RAISE EXCEPTION 'artifact_integrity_failed'; END IF;
  until_time:=least(until_time,b.expires_at);
 END IF;
 status:=(m->>'status_code')::integer;
 IF status IS NULL THEN expected_state:='unknown';expected_reason:='transport_failed';
 ELSIF status IN (401,403) THEN expected_state:='denied';expected_reason:='access_denied';
 ELSIF status IN (404,410) THEN expected_state:='known';expected_reason:='not_available';
 ELSIF status<200 OR status>=300 OR (m->>'truncated')::boolean OR body_bytes IS NULL OR b.mime_type IS DISTINCT FROM 'text/plain' OR m->'error'<>'null'::jsonb THEN expected_state:='unknown';expected_reason:='unavailable_or_incomplete';
 ELSE
  -- Parsing stays in the trusted bounded deterministic adapter. SQL authenticates
  -- exact input bytes and restricts the only two outcomes its parser can produce.
  IF result_json->>'state'='known' AND result_json->>'reason'='parsed' THEN expected_state:='known';expected_reason:='parsed';
  ELSIF result_json->>'state'='unknown' AND result_json->>'reason'='parse_failed' THEN expected_state:='unknown';expected_reason:='parse_failed';
  ELSE RAISE EXCEPTION 'invalid_receipt'; END IF;
 END IF;
 IF result_json-ARRAY['invocationId','observationId','bodyEvidenceId','receiptEvidenceId','contextHash','state','reason','policyVersion','parserVersion','freshUntil']<>'{}'::jsonb OR (SELECT count(*) FROM jsonb_object_keys(result_json))<>10 OR result_json->>'invocationId' IS DISTINCT FROM h.invocation_id::text OR result_json->>'observationId' IS DISTINCT FROM accepted.observation_id::text OR result_json->>'bodyEvidenceId' IS DISTINCT FROM accepted.body_evidence_id::text OR result_json->>'receiptEvidenceId' IS DISTINCT FROM e.id::text OR result_json->>'contextHash' IS DISTINCT FROM e.sha256 OR result_json->>'state' IS DISTINCT FROM expected_state OR result_json->>'reason' IS DISTINCT FROM expected_reason OR result_json->>'policyVersion' IS DISTINCT FROM 'discovery-v1' OR result_json->>'parserVersion' IS DISTINCT FROM 'robots-v1' OR (result_json->>'freshUntil')::timestamptz IS DISTINCT FROM until_time THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF prior.job_id IS NOT NULL THEN RETURN NEXT prior;RETURN; END IF;
 UPDATE aios.knowledge_clock SET seq=knowledge_clock.seq+1,recorded_at=greatest(clock_timestamp(),knowledge_clock.recorded_at) WHERE tenant_id=t RETURNING knowledge_clock.seq,knowledge_clock.recorded_at INTO seq,at_time;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_denied'; END IF;
 INSERT INTO aios.knowledge_commit VALUES(t,seq,at_time);
 INSERT INTO aios.http_bootstrap_projection(tenant_id,site_id,crawl_id,job_id,invocation_id,observation_id,receipt_hash,result) VALUES(t,s,r,j,h.invocation_id,accepted.observation_id,e.sha256,result_json);
 UPDATE aios.job SET state='completed',lease_token=NULL,lease_until=NULL,result_ref=accepted.observation_id WHERE tenant_id=t AND job_id=j;
 UPDATE aios.job_attempt SET ended_at=at_time,outcome='completed' WHERE tenant_id=t AND job_id=j AND attempt_no=a;
 eid:=gen_random_uuid();envelope:=jsonb_build_object('event_id',eid,'tenant_id',t,'site_id',s,'aggregate_id',accepted.observation_id,'causation_id',NULL,'correlation_id',r,'recorded_at',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'knowledge_seq',seq,'producer','http-bootstrap-projection@1.0.0','schema_version',2,'aggregate_version',2,'idempotency_key',h.invocation_id::text||':job.completed','occurred_at',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'event_type','job.completed','payload',jsonb_build_object('job_id',j,'result_ref',accepted.observation_id));
 INSERT INTO aios.outbox VALUES(t,s,eid,accepted.observation_id,'job.completed',envelope,at_time,NULL);
 RETURN QUERY SELECT * FROM aios.http_bootstrap_projection WHERE tenant_id=t AND job_id=j;
END $$;
REVOKE ALL ON FUNCTION control.project_http_bootstrap_fixture(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,bytea,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.project_http_bootstrap_fixture(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,bytea,jsonb) TO aios_scheduler;
