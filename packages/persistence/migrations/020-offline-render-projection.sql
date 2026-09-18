SET search_path=aios,pg_catalog;
CREATE TABLE render_fixture_projection (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,job_id uuid NOT NULL,
 invocation_id uuid NOT NULL,observation_id uuid NOT NULL,manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),
 render_snapshot_ids uuid[] NOT NULL CHECK(cardinality(render_snapshot_ids)<=3),result text NOT NULL CHECK(result IN ('partial','failed')),
 created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
 PRIMARY KEY(tenant_id,job_id),UNIQUE(tenant_id,invocation_id),UNIQUE(tenant_id,observation_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES job(tenant_id,job_id),FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,invocation_id) REFERENCES render_fixture_acceptance(tenant_id,invocation_id),
 FOREIGN KEY(tenant_id,site_id,observation_id) REFERENCES observation(tenant_id,site_id,id)
);
ALTER TABLE render_fixture_projection ENABLE ROW LEVEL SECURITY;ALTER TABLE render_fixture_projection FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON render_fixture_projection USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER immutable_render_fixture_projection BEFORE UPDATE OR DELETE ON render_fixture_projection FOR EACH ROW EXECUTE FUNCTION reject_mutation();
REVOKE ALL ON render_fixture_projection FROM PUBLIC,aios_runtime,aios_scheduler,aios_render_supervisor,aios_render_acceptor;
GRANT SELECT ON render_fixture_projection TO aios_scheduler,aios_evaluator;
CREATE OR REPLACE FUNCTION aios.guard_offline_render_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable_render_descriptor';END IF;
 IF TG_TABLE_NAME='offline_render_job' THEN RAISE EXCEPTION 'immutable_render_descriptor';END IF;
 IF TG_OP='UPDATE' AND (OLD.kind='render' OR NEW.kind='render') AND (OLD.kind,OLD.tenant_id,OLD.site_id,OLD.crawl_id,OLD.job_id,OLD.input_ref,OLD.expected_input_hash,OLD.release_digest,OLD.release_generation,OLD.idempotency_key) IS DISTINCT FROM (NEW.kind,NEW.tenant_id,NEW.site_id,NEW.crawl_id,NEW.job_id,NEW.input_ref,NEW.expected_input_hash,NEW.release_digest,NEW.release_generation,NEW.idempotency_key) THEN RAISE EXCEPTION 'immutable_render_descriptor';END IF;
 IF NEW.kind='render' AND (NEW.state='completed' OR NEW.result_ref IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM aios.render_fixture_projection p WHERE p.tenant_id=NEW.tenant_id AND p.site_id=NEW.site_id AND p.crawl_id=NEW.crawl_id AND p.job_id=NEW.job_id AND p.observation_id=NEW.result_ref AND NEW.state='completed' AND NEW.lease_token IS NULL AND NEW.lease_until IS NULL AND p.created_xid=pg_current_xact_id()) THEN RAISE EXCEPTION 'handler_not_installed';END IF;
 IF TG_OP='UPDATE' AND OLD.kind='render' AND OLD.state='completed' THEN RAISE EXCEPTION 'immutable_render_completion';END IF;
 IF NEW.kind='render' AND NOT EXISTS(SELECT 1 FROM aios.offline_render_job WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'render_descriptor_required';END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION control.project_offline_render_fixture(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,obs uuid,manifest_text text)
RETURNS SETOF aios.render_fixture_projection LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE jobrow aios.job;accepted aios.render_fixture_acceptance;h aios.render_reservation;z aios.render_terminal_receipt;prior aios.render_fixture_projection;receipt aios.evidence;observation aios.observation;artifact aios.evidence;d jsonb;m jsonb;sample jsonb;ids uuid[]:='{}';sid uuid;n integer:=0;seq bigint;at_time timestamptz;envelope jsonb;eid uuid;result text;last_offset integer:=-1;last_time timestamptz;
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required';END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 IF NOT EXISTS(SELECT 1 FROM aios.tenant x WHERE x.id=t AND x.policy_profile_id='local-synthetic-v1') THEN RAISE EXCEPTION 'policy_blocked';END IF;
 SELECT * INTO jobrow FROM aios.job WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND kind='render' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'handler_not_installed';END IF;
 PERFORM control.assert_offline_render_release(jobrow.release_digest);
 SELECT * INTO accepted FROM aios.render_fixture_acceptance WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND observation_id=obs;
 IF NOT FOUND THEN RAISE EXCEPTION 'snapshot_unavailable';END IF;
 SELECT * INTO h FROM aios.render_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND invocation_id=accepted.invocation_id AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND settled_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'lease_lost';END IF;
 IF NOT control.assert_render_job_context(t,j,h.page_snapshot_id,h.bundle_id,h.input_sha256,h.profile,h.source_context_hash) THEN RAISE EXCEPTION 'invalid_receipt';END IF;
 SELECT * INTO z FROM aios.render_terminal_receipt WHERE tenant_id=t AND receipt_id=accepted.terminal_receipt_id AND invocation_id=h.invocation_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt';END IF;
 SELECT * INTO prior FROM aios.render_fixture_projection WHERE tenant_id=t AND job_id=j;
 IF FOUND THEN
  IF jobrow.state<>'completed' OR jobrow.result_ref IS DISTINCT FROM obs OR prior.observation_id<>obs OR prior.invocation_id<>accepted.invocation_id OR prior.manifest_hash IS DISTINCT FROM encode(sha256(convert_to(manifest_text,'UTF8')),'hex') THEN RAISE EXCEPTION 'conflict';END IF;
  RETURN NEXT prior;RETURN;
 END IF;
 IF jobrow.state<>'leased' OR jobrow.lease_token IS DISTINCT FROM tok OR jobrow.attempt<>a OR jobrow.lease_until<=clock_timestamp() OR jobrow.deadline<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM aios.job_attempt WHERE tenant_id=t AND job_id=j AND attempt_no=a AND attempt_id=aid AND ended_at IS NULL) THEN RAISE EXCEPTION 'lease_lost';END IF;
 SELECT descriptor INTO d FROM aios.offline_render_job WHERE tenant_id=t AND job_id=j;
 SELECT * INTO receipt FROM aios.evidence WHERE tenant_id=t AND site_id=s AND id=accepted.receipt_evidence_id AND state='available' AND deleted_at IS NULL AND expires_at>clock_timestamp() AND mime_type='application/json' AND redaction_version='render-privacy-v1';
 IF NOT FOUND OR octet_length(manifest_text)>5242880 OR receipt.sha256 IS DISTINCT FROM encode(sha256(convert_to(manifest_text,'UTF8')),'hex') OR receipt.bytes<>octet_length(manifest_text) THEN RAISE EXCEPTION 'artifact_integrity_failed';END IF;
 SELECT * INTO observation FROM aios.observation WHERE tenant_id=t AND site_id=s AND id=obs AND state IN ('partial','failed') AND deleted_at IS NULL AND fresh_until>clock_timestamp() AND subject_id=h.page_snapshot_id AND context_hash=receipt.sha256;
 IF NOT FOUND THEN RAISE EXCEPTION 'snapshot_unavailable';END IF;
 m:=manifest_text::jsonb;
 IF m->>'receipt_type' IS DISTINCT FROM 'offline_render_privacy_projection' OR m->>'schema_version' IS DISTINCT FROM '2' OR m->>'redaction_version' IS DISTINCT FROM 'render-privacy-v1' OR m->>'coverage' IS DISTINCT FROM 'privacy_limited' OR m->>'tenant_id' IS DISTINCT FROM t::text OR m->>'site_id' IS DISTINCT FROM s::text OR m->>'crawl_id' IS DISTINCT FROM r::text OR m->>'invocation_id' IS DISTINCT FROM accepted.invocation_id::text OR m->>'receipt_evidence_id' IS DISTINCT FROM receipt.id::text OR m->>'page_snapshot_id' IS DISTINCT FROM h.page_snapshot_id::text OR m->'preparation'->>'input_sha256' IS DISTINCT FROM h.input_sha256 OR jsonb_typeof(m->'worker'->'samples') IS DISTINCT FROM 'array' OR jsonb_array_length(m->'worker'->'samples')<>cardinality(accepted.dom_evidence_ids) OR jsonb_array_length(m->'worker'->'samples')>3 OR length(m->'invocation'->>'expected_browser_build') NOT BETWEEN 1 AND 4096 THEN RAISE EXCEPTION 'invalid_receipt';END IF;
 UPDATE aios.knowledge_clock SET seq=knowledge_clock.seq+1,recorded_at=greatest(clock_timestamp(),knowledge_clock.recorded_at) WHERE tenant_id=t RETURNING knowledge_clock.seq,knowledge_clock.recorded_at INTO seq,at_time;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_denied';END IF;
 INSERT INTO aios.knowledge_commit VALUES(t,seq,at_time);
 FOR sample IN SELECT value FROM jsonb_array_elements(m->'worker'->'samples') LOOP
  n:=n+1;
  SELECT * INTO artifact FROM aios.evidence WHERE tenant_id=t AND site_id=s AND id=accepted.dom_evidence_ids[n] AND state='available' AND deleted_at IS NULL AND expires_at>clock_timestamp() AND mime_type='text/html' AND redaction_version='render-privacy-v1';
  IF NOT FOUND OR artifact.id::text IS DISTINCT FROM sample->>'evidence_id' OR artifact.sha256 IS DISTINCT FROM sample->>'sha256' OR artifact.bytes IS DISTINCT FROM (sample->>'bytes')::bigint OR artifact.captured_at IS DISTINCT FROM (sample->>'observedAt')::timestamptz OR (sample->>'observedAt')::timestamptz NOT BETWEEN z.started_at AND z.finished_at OR (sample->>'offsetMs')::integer NOT IN (0,2000,5000) OR (sample->>'offsetMs')::integer<=last_offset OR (sample->>'pendingRequests')::integer NOT BETWEEN 0 AND 100 OR (last_time IS NOT NULL AND artifact.captured_at<last_time) THEN RAISE EXCEPTION 'invalid_receipt';END IF;
  last_offset:=(sample->>'offsetMs')::integer;last_time:=artifact.captured_at;
  sid:=gen_random_uuid();ids:=array_append(ids,sid);
  INSERT INTO aios.render_snapshot VALUES('RenderSnapshot',sid,1,1,at_time,at_time,at_time,NULL,'policy_limited','raw',t,s,sid,NULL,NULL,NULL,h.page_snapshot_id,obs,artifact.id,artifact.captured_at,m->'invocation'->>'expected_browser_build',receipt.sha256,(sample->>'offsetMs')::bigint,NULL,(sample->>'pendingRequests')::bigint,seq,NULL);
  INSERT INTO aios.record_link VALUES(t,sid,'provenance_ids',0,artifact.id,'Evidence'),(t,sid,'provenance_ids',1,receipt.id,'Evidence'),(t,sid,'provenance_ids',2,obs,'Observation'),(t,sid,'provenance_ids',3,h.bundle_id,'EvidenceBundle');
 END LOOP;
 result:=CASE WHEN cardinality(ids)=0 THEN 'failed' ELSE 'partial' END;
 INSERT INTO aios.render_fixture_projection(tenant_id,site_id,crawl_id,job_id,invocation_id,observation_id,manifest_hash,render_snapshot_ids,result) VALUES(t,s,r,j,h.invocation_id,obs,receipt.sha256,ids,result);
 UPDATE aios.job SET state='completed',lease_token=NULL,lease_until=NULL,result_ref=obs WHERE tenant_id=t AND job_id=j;
 UPDATE aios.job_attempt SET ended_at=at_time,outcome='completed' WHERE tenant_id=t AND job_id=j AND attempt_no=a;
 envelope:=jsonb_build_object('tenant_id',t,'site_id',s,'aggregate_id',obs,'causation_id',NULL,'correlation_id',r,'recorded_at',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'knowledge_seq',seq,'producer','offline-render-projection@1.0.0');
 eid:=gen_random_uuid();envelope:=envelope||jsonb_build_object('event_id',eid,'schema_version',1,'aggregate_version',2,'idempotency_key',h.invocation_id::text||':render.completed','occurred_at',to_char(z.finished_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'event_type','render.completed','payload',jsonb_build_object('crawl_id',r,'render_snapshot_ids',to_jsonb(ids),'result',result));
 INSERT INTO aios.outbox VALUES(t,s,eid,obs,'render.completed',envelope,at_time,NULL);
 eid:=gen_random_uuid();envelope:=envelope||jsonb_build_object('event_id',eid,'schema_version',2,'aggregate_version',3,'idempotency_key',h.invocation_id::text||':job.completed','occurred_at',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'event_type','job.completed','payload',jsonb_build_object('job_id',j,'result_ref',obs));
 INSERT INTO aios.outbox VALUES(t,s,eid,obs,'job.completed',envelope,at_time,NULL);
 RETURN QUERY SELECT * FROM aios.render_fixture_projection WHERE tenant_id=t AND job_id=j;
END $$;
REVOKE ALL ON FUNCTION control.project_offline_render_fixture(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.project_offline_render_fixture(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,text) TO aios_scheduler;
