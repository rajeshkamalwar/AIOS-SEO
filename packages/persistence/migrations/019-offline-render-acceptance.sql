SET search_path=aios,pg_catalog;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aios_render_acceptor') THEN CREATE ROLE aios_render_acceptor NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; END IF;
END $$;
GRANT USAGE ON SCHEMA aios,control TO aios_render_acceptor;
GRANT EXECUTE ON FUNCTION aios.authorize(text,uuid) TO aios_render_acceptor;
GRANT SELECT ON aios.tenant,aios.site,aios.crawl,aios.work_fence,aios.job,aios.job_attempt,aios.job_release,aios.offline_render_job,aios.page,aios.page_snapshot,aios.crawl_target,aios.evidence_bundle,aios.evidence,aios.observation,aios.record_link,aios.record_index,aios.site_scope_acceptance,aios.http_fixture_acceptance,aios.fixture_frontier_batch,aios.fixture_link_batch,aios.fixture_sitemap_document,aios.self_audit_result,aios.audit_recovery,aios.audit_impact,aios.audit_output,aios.render_reservation,aios.render_invocation,aios.render_terminal_receipt TO aios_render_acceptor;
GRANT SELECT ON control.health,control.release,control.release_dependency,control.release_state,control.authority_key TO aios_render_acceptor;
CREATE TABLE render_fixture_acceptance (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,job_id uuid NOT NULL,
 invocation_id uuid NOT NULL,terminal_receipt_id uuid NOT NULL,input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 receipt_evidence_id uuid NOT NULL,dom_evidence_ids uuid[] NOT NULL CHECK(cardinality(dom_evidence_ids)<=3),observation_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,invocation_id),UNIQUE(tenant_id,terminal_receipt_id),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),FOREIGN KEY(tenant_id,job_id) REFERENCES job(tenant_id,job_id),
 FOREIGN KEY(tenant_id,invocation_id) REFERENCES render_reservation(tenant_id,invocation_id),FOREIGN KEY(tenant_id,terminal_receipt_id) REFERENCES render_terminal_receipt(tenant_id,receipt_id),
 FOREIGN KEY(tenant_id,site_id,receipt_evidence_id) REFERENCES evidence(tenant_id,site_id,id),FOREIGN KEY(tenant_id,site_id,observation_id) REFERENCES observation(tenant_id,site_id,id)
);
ALTER TABLE render_fixture_acceptance ENABLE ROW LEVEL SECURITY;ALTER TABLE render_fixture_acceptance FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON render_fixture_acceptance USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER immutable_render_fixture_acceptance BEFORE UPDATE OR DELETE ON render_fixture_acceptance FOR EACH ROW EXECUTE FUNCTION reject_mutation();
REVOKE ALL ON render_fixture_acceptance FROM PUBLIC,aios_runtime,aios_scheduler,aios_render_supervisor;
GRANT SELECT ON render_fixture_acceptance TO aios_scheduler,aios_evaluator,aios_render_acceptor;
CREATE FUNCTION control.accept_offline_render_fixture(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,iid uuid,terminal uuid,digest text,p jsonb)
RETURNS SETOF aios.render_fixture_acceptance LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m jsonb;op jsonb;sample jsonb;computed text;h aios.render_reservation;z aios.render_terminal_receipt;d jsonb;prior aios.render_fixture_acceptance;artifact jsonb;ids uuid[];doms uuid[];seq bigint;at_time timestamptz;common jsonb;obs uuid;receipt uuid;event_id uuid;ev jsonb;n integer:=0;
BEGIN
 IF session_user<>'aios_render_acceptor' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 IF NOT EXISTS(SELECT 1 FROM aios.tenant x WHERE x.id=t AND x.policy_profile_id='local-synthetic-v1') THEN RAISE EXCEPTION 'policy_blocked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.job x JOIN aios.job_attempt y ON y.tenant_id=x.tenant_id AND y.job_id=x.job_id AND y.attempt_no=x.attempt WHERE x.tenant_id=t AND x.site_id=s AND x.crawl_id=r AND x.job_id=j AND x.kind='render' AND x.state='leased' AND x.attempt=a AND x.lease_token=tok AND x.lease_until>clock_timestamp() AND x.deadline>clock_timestamp() AND y.attempt_id=aid) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 SELECT * INTO h FROM aios.render_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND invocation_id=iid AND settled_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt';END IF;
 IF NOT control.assert_render_job_context(t,j,h.page_snapshot_id,h.bundle_id,h.input_sha256,h.profile,h.source_context_hash) THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 SELECT * INTO z FROM aios.render_terminal_receipt WHERE tenant_id=t AND reservation_id=h.reservation_id AND invocation_id=iid AND receipt_id=terminal AND result_digest=digest;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt';END IF;
 SELECT descriptor INTO d FROM aios.offline_render_job WHERE tenant_id=t AND job_id=j;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR coalesce(p->>'inputHash','') !~ '^[a-f0-9]{64}$' OR coalesce(p->>'manifestSha','') !~ '^[a-f0-9]{64}$' OR p->>'state' NOT IN ('partial','failed') OR jsonb_typeof(p->'artifacts') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'artifacts') NOT BETWEEN 1 AND 4 OR (p->>'observedAt')::timestamptz IS DISTINCT FROM z.finished_at OR p->>'sourceUri' IS DISTINCT FROM split_part(split_part(d->>'url','?',1),'#',1) THEN RAISE EXCEPTION 'invalid_receipt';END IF;
 IF octet_length(p->>'manifestText')>5242880 OR encode(sha256(convert_to(p->>'manifestText','UTF8')),'hex') IS DISTINCT FROM p->>'manifestSha' THEN RAISE EXCEPTION 'artifact_integrity_failed';END IF;
 m:=(p->>'manifestText')::jsonb;op:=p->'operational';
 IF op->>'invocationId' IS DISTINCT FROM iid::text OR op->>'terminalReceiptId' IS DISTINCT FROM terminal::text OR op->>'containerId' IS DISTINCT FROM z.container_id OR op->>'conformance' IS DISTINCT FROM 'valid' OR op->>'state' NOT IN ('executed','failed','aborted','timeout') OR op->>'workerState' NOT IN ('captured','policy_limited','failed','timeout') OR op->>'evidenceAccepted' IS DISTINCT FROM 'false' OR coalesce(op->>'stdoutSha256','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_receipt';END IF;
 computed:=encode(sha256(convert_to('{"conformance":"valid","evidenceAccepted":false,"state":'||(op->'state')::text||',"stdoutSha256":'||(op->'stdoutSha256')::text||',"workerState":'||(op->'workerState')::text||'}','UTF8')),'hex');
 IF computed IS DISTINCT FROM z.result_digest OR m->>'receipt_type' IS DISTINCT FROM 'offline_render_privacy_projection' OR m->>'schema_version' IS DISTINCT FROM '2' OR m->>'redaction_version' IS DISTINCT FROM 'render-privacy-v1' OR m->>'coverage' IS DISTINCT FROM 'privacy_limited' OR m->>'deployment_profile' IS DISTINCT FROM 'local-synthetic-v1' OR m->>'authority' IS DISTINCT FROM 'fixture_only' OR m->>'live_dispatch' IS DISTINCT FROM 'false' OR m->>'website_write' IS DISTINCT FROM 'false' OR p->>'state' IS DISTINCT FROM (CASE WHEN op->>'workerState' IN ('captured','policy_limited') THEN 'partial' ELSE 'failed' END) OR m->>'tenant_id' IS DISTINCT FROM t::text OR m->>'site_id' IS DISTINCT FROM s::text OR m->>'crawl_id' IS DISTINCT FROM r::text OR m->>'invocation_id' IS DISTINCT FROM iid::text OR m->>'page_snapshot_id' IS DISTINCT FROM h.page_snapshot_id::text OR m->>'receipt_evidence_id' IS DISTINCT FROM p->>'receiptId' OR m->'transport'->>'sha256' IS DISTINCT FROM op->>'stdoutSha256' OR m->'transport'->>'retained' IS DISTINCT FROM 'false' OR m->'source'->>'evidence_id' IS DISTINCT FROM d->>'rawEvidenceId' OR m->'source'->>'sha256' IS DISTINCT FROM d->>'rawSha256' OR m->'preparation'->>'input_sha256' IS DISTINCT FROM h.input_sha256 OR m->'preparation'->>'url' IS DISTINCT FROM p->>'sourceUri' OR m->'worker'->>'state' IS DISTINCT FROM op->>'workerState' OR (m->'invocation'->>'started_at')::timestamptz IS DISTINCT FROM z.started_at OR (m->'invocation'->>'finished_at')::timestamptz IS DISTINCT FROM z.finished_at OR jsonb_array_length(m->'worker'->'samples') IS DISTINCT FROM jsonb_array_length(p->'domIds') THEN RAISE EXCEPTION 'invalid_receipt';END IF;
 SELECT * INTO prior FROM aios.render_fixture_acceptance WHERE tenant_id=t AND invocation_id=iid;
 IF FOUND THEN IF prior.input_hash IS DISTINCT FROM p->>'inputHash' OR prior.terminal_receipt_id<>terminal THEN RAISE EXCEPTION 'conflict'; END IF;RETURN NEXT prior;RETURN;END IF;
 receipt:=(p->>'receiptId')::uuid;obs:=(p->>'observationId')::uuid;
 SELECT coalesce(array_agg(v::uuid),'{}'::uuid[]) INTO doms FROM jsonb_array_elements_text(p->'domIds') v;
 ids:=ARRAY[receipt]||doms;
 IF cardinality(ids)<>jsonb_array_length(p->'artifacts') OR (SELECT count(DISTINCT x) FROM unnest(ids) x)<>cardinality(ids) OR obs=ANY(ids) THEN RAISE EXCEPTION 'invalid_receipt';END IF;
 UPDATE aios.knowledge_clock SET seq=knowledge_clock.seq+1,recorded_at=greatest(clock_timestamp(),knowledge_clock.recorded_at) WHERE tenant_id=t RETURNING knowledge_clock.seq,knowledge_clock.recorded_at INTO seq,at_time;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_denied';END IF;
 INSERT INTO aios.knowledge_commit VALUES(t,seq,at_time);
 common:=jsonb_build_object('schema_version',1,'version',1,'created_at',at_time,'recorded_at',at_time,'updated_at',at_time,'deleted_at',NULL,'retention_class','raw','tenant_id',t,'site_id',s,'knowledge_seq',seq);
 FOR artifact IN SELECT value FROM jsonb_array_elements(p->'artifacts') LOOP
  n:=n+1;
  IF artifact->>'id' IS DISTINCT FROM ids[n]::text OR artifact->>'key' IS DISTINCT FROM t::text||'/'||s::text||'/'||ids[n]::text OR coalesce(artifact->>'sha256','') !~ '^[a-f0-9]{64}$' OR (artifact->>'bytes')::bigint NOT BETWEEN 0 AND 5242880 OR artifact->>'mime' IS DISTINCT FROM (CASE WHEN n=1 THEN 'application/json' ELSE 'text/html' END) OR (artifact->>'capturedAt')::timestamptz NOT BETWEEN z.started_at AND z.finished_at OR (n=1 AND (artifact->>'sha256' IS DISTINCT FROM p->>'manifestSha' OR (artifact->>'capturedAt')::timestamptz<>z.finished_at)) THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
  IF n=1 THEN
   IF (artifact->>'bytes')::bigint<>octet_length(p->>'manifestText') THEN RAISE EXCEPTION 'artifact_integrity_failed';END IF;
  ELSE
   sample:=m->'worker'->'samples'->(n-2);
   IF sample->>'evidence_id' IS DISTINCT FROM artifact->>'id' OR sample->>'sha256' IS DISTINCT FROM artifact->>'sha256' OR sample->>'bytes' IS DISTINCT FROM artifact->>'bytes' OR sample->>'observedAt' IS DISTINCT FROM artifact->>'capturedAt' OR sample->>'original_retained' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'invalid_receipt';END IF;
  END IF;
  INSERT INTO aios.evidence SELECT (jsonb_populate_record(NULL::aios.evidence,common||jsonb_build_object('record_type','Evidence','id',ids[n],'state','available','artifact_key',artifact->>'key','sha256',artifact->>'sha256','mime_type',artifact->>'mime','bytes',(artifact->>'bytes')::bigint,'captured_at',artifact->>'capturedAt','source_uri',p->>'sourceUri','source_class','first_party_observation','locator','bytes:0:'||(artifact->>'bytes'),'redaction_version','render-privacy-v1','expires_at',(artifact->>'capturedAt')::timestamptz+interval '7 days'))).*;
  INSERT INTO aios.record_link VALUES(t,ids[n],'provenance_ids',0,(d->>'rawEvidenceId')::uuid,'Evidence'),(t,ids[n],'provenance_ids',1,(d->>'observationId')::uuid,'Observation'),(t,ids[n],'provenance_ids',2,h.bundle_id,'EvidenceBundle');
 END LOOP;
 INSERT INTO aios.observation SELECT (jsonb_populate_record(NULL::aios.observation,common||jsonb_build_object('record_type','Observation','id',obs,'state',p->>'state','sensor_id','offline-render-fixture','sensor_version','1.0.0','subject_id',h.page_snapshot_id,'observed_at',z.finished_at,'window_start',NULL,'window_end',NULL,'source_timezone','UTC','context_hash',p->>'manifestSha','fresh_until',least((p->>'freshUntil')::timestamptz,z.finished_at+interval '24 hours',(SELECT fresh_until FROM aios.observation WHERE tenant_id=t AND id=(d->>'observationId')::uuid)),'attempt_id',iid,'error',CASE WHEN p->>'state'='failed' THEN jsonb_build_object('code','source_unavailable','retryable',false,'detail','offline_render_failed','evidence_ids',jsonb_build_array(receipt)) ELSE NULL END))).*;
 FOR n IN 1..cardinality(ids) LOOP INSERT INTO aios.record_link VALUES(t,obs,'evidence_ids',n-1,ids[n],'Evidence');END LOOP;
 INSERT INTO aios.record_link VALUES(t,obs,'provenance_ids',0,(d->>'observationId')::uuid,'Observation'),(t,obs,'provenance_ids',1,(d->>'rawEvidenceId')::uuid,'Evidence'),(t,obs,'provenance_ids',2,h.bundle_id,'EvidenceBundle');
 INSERT INTO aios.render_fixture_acceptance VALUES(t,s,r,j,iid,terminal,p->>'inputHash',receipt,doms,obs);
 event_id:=gen_random_uuid();ev:=jsonb_build_object('event_id',event_id,'tenant_id',t,'site_id',s,'schema_version',1,'aggregate_id',obs,'aggregate_version',1,'causation_id',NULL,'correlation_id',r,'occurred_at',to_char(z.finished_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'recorded_at',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'knowledge_seq',seq,'idempotency_key',iid::text,'producer','offline-render-fixture@1.0.0','event_type','evidence.recorded','payload',jsonb_build_object('evidence_id',receipt,'observation_id',obs));
 INSERT INTO aios.outbox VALUES(t,s,event_id,obs,'evidence.recorded',ev,at_time,NULL);
 RETURN QUERY SELECT * FROM aios.render_fixture_acceptance WHERE tenant_id=t AND invocation_id=iid;
END $$;
REVOKE ALL ON FUNCTION control.accept_offline_render_fixture(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.accept_offline_render_fixture(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,text,jsonb) TO aios_render_acceptor;
