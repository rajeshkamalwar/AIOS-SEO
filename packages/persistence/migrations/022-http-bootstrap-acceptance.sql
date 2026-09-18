SET search_path=aios,pg_catalog;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aios_http_acceptor') THEN CREATE ROLE aios_http_acceptor NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; END IF;
END $$;
GRANT USAGE ON SCHEMA aios,control TO aios_http_acceptor;
GRANT EXECUTE ON FUNCTION aios.authorize(text,uuid) TO aios_http_acceptor;
GRANT SELECT ON tenant,site,crawl,work_fence,job,job_attempt,job_release,http_bootstrap_job,evidence_bundle,evidence,observation,record_link,record_index,site_scope_acceptance,http_fixture_acceptance,self_audit_result,audit_recovery,audit_impact,audit_output,http_reservation,http_invocation,http_terminal_receipt TO aios_http_acceptor;
GRANT SELECT ON control.health,control.release,control.release_dependency,control.release_state,control.authority_key TO aios_http_acceptor;
CREATE TABLE http_bootstrap_acceptance (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,job_id uuid NOT NULL,
 invocation_id uuid NOT NULL,terminal_receipt_id uuid NOT NULL,input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 body_evidence_id uuid,receipt_evidence_id uuid NOT NULL,observation_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,invocation_id),UNIQUE(tenant_id,terminal_receipt_id),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),FOREIGN KEY(tenant_id,job_id) REFERENCES job(tenant_id,job_id),
 FOREIGN KEY(tenant_id,invocation_id) REFERENCES http_reservation(tenant_id,invocation_id),FOREIGN KEY(tenant_id,terminal_receipt_id) REFERENCES http_terminal_receipt(tenant_id,receipt_id),
 FOREIGN KEY(tenant_id,site_id,body_evidence_id) REFERENCES evidence(tenant_id,site_id,id),FOREIGN KEY(tenant_id,site_id,receipt_evidence_id) REFERENCES evidence(tenant_id,site_id,id),FOREIGN KEY(tenant_id,site_id,observation_id) REFERENCES observation(tenant_id,site_id,id)
);
ALTER TABLE http_bootstrap_acceptance ENABLE ROW LEVEL SECURITY;ALTER TABLE http_bootstrap_acceptance FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON http_bootstrap_acceptance USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER immutable_http_bootstrap_acceptance BEFORE UPDATE OR DELETE ON http_bootstrap_acceptance FOR EACH ROW EXECUTE FUNCTION reject_mutation();
REVOKE ALL ON http_bootstrap_acceptance FROM PUBLIC,aios_runtime,aios_scheduler,aios_http_supervisor;
GRANT SELECT ON http_bootstrap_acceptance TO aios_scheduler,aios_evaluator,aios_http_acceptor;
CREATE FUNCTION control.accept_http_bootstrap_fixture(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,iid uuid,terminal uuid,digest text,p jsonb)
RETURNS SETOF aios.http_bootstrap_acceptance LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h aios.http_reservation;z aios.http_terminal_receipt;i aios.http_invocation;d jsonb;receipt jsonb;raw_receipt jsonb;transcript jsonb;capture jsonb;prior aios.http_bootstrap_acceptance;artifact jsonb;ids uuid[];seq bigint;at_time timestamptz;common jsonb;obs uuid;body uuid;out_receipt uuid;event_id uuid;ev jsonb;observed timestamptz;observation_state text;n integer:=0;
BEGIN
 IF session_user<>'aios_http_acceptor' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 IF NOT EXISTS(SELECT 1 FROM aios.job x JOIN aios.job_attempt y ON y.tenant_id=x.tenant_id AND y.job_id=x.job_id AND y.attempt_no=x.attempt WHERE x.tenant_id=t AND x.site_id=s AND x.crawl_id=r AND x.job_id=j AND x.kind='fetch' AND x.state='leased' AND x.attempt=a AND x.lease_token=tok AND x.lease_until>clock_timestamp() AND x.deadline>clock_timestamp() AND y.attempt_id=aid) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 SELECT * INTO h FROM aios.http_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND invocation_id=iid AND settled_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 PERFORM control.assert_http_bootstrap_context(t,s,r,j,a,h.origin,h.reserved_bytes);
 SELECT * INTO z FROM aios.http_terminal_receipt WHERE tenant_id=t AND reservation_id=h.reservation_id AND invocation_id=iid AND receipt_id=terminal AND result_digest=digest;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 SELECT * INTO i FROM aios.http_invocation WHERE tenant_id=t AND reservation_id=h.reservation_id AND invocation_id=iid;
 SELECT descriptor INTO d FROM aios.http_bootstrap_job WHERE tenant_id=t AND job_id=j;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p-ARRAY['inputHash','terminalText','rawReceiptText','receiptText','bodyId','receiptId','observationId','observedAt','freshUntil','sourceUri','imageDigest','inputContextHash','artifacts']<>'{}'::jsonb OR (SELECT count(*) FROM jsonb_object_keys(p))<>13 OR coalesce(p->>'inputHash','') !~ '^[a-f0-9]{64}$' OR p->>'imageDigest' IS DISTINCT FROM i.collector_build_digest OR p->>'inputContextHash' IS DISTINCT FROM i.input_context_hash OR p->>'sourceUri' IS DISTINCT FROM d->>'url' OR jsonb_typeof(p->'artifacts') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'artifacts') NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF octet_length(p->>'terminalText')>32768 OR octet_length(p->>'rawReceiptText')>32768 OR octet_length(p->>'receiptText')>32768 OR encode(sha256(convert_to(p->>'terminalText','UTF8')),'hex') IS DISTINCT FROM digest THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 transcript:=(p->>'terminalText')::jsonb;capture:=transcript->'capture';receipt:=(p->>'receiptText')::jsonb;raw_receipt:=(p->>'rawReceiptText')::jsonb;observed:=(p->>'observedAt')::timestamptz;
 IF transcript->>'profile' IS DISTINCT FROM 'isolated-http-fixture-v1' OR capture->>'observedAt' IS DISTINCT FROM p->>'observedAt' OR capture->>'receiptSha256' IS DISTINCT FROM encode(sha256(convert_to(p->>'rawReceiptText','UTF8')),'hex') OR raw_receipt->'body_evidence_id' IS DISTINCT FROM 'null'::jsonb OR receipt-'body_evidence_id' IS DISTINCT FROM raw_receipt-'body_evidence_id' OR receipt->>'body_evidence_id' IS DISTINCT FROM p->>'bodyId' OR receipt->>'url' IS DISTINCT FROM d->>'url' OR receipt->>'final_url' IS DISTINCT FROM d->>'url' OR receipt->>'method' IS DISTINCT FROM 'GET' OR observed NOT BETWEEN i.started_at AND z.finished_at OR observed>(transcript->>'brokerClosedAt')::timestamptz OR (transcript->>'brokerClosedAt')::timestamptz>z.finished_at OR NOT isfinite(observed) OR observed<>date_trunc('milliseconds',observed) THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF transcript->>'workerConformance' NOT IN ('valid','invalid') OR transcript->>'workerConformance' IS NULL OR transcript->>'protocolViolation' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF receipt->'status_code'='null'::jsonb THEN
  IF transcript->'brokerResult' IS DISTINCT FROM 'null'::jsonb OR transcript->>'state' NOT IN ('failed','timeout','exited') OR p->'bodyId' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 ELSE
  IF transcript->>'workerConformance' IS DISTINCT FROM 'valid' OR transcript->>'state' IS DISTINCT FROM 'exited' OR transcript->>'exitCode' IS DISTINCT FROM '0' OR transcript->'brokerResult' IS DISTINCT FROM jsonb_build_object('status',receipt->'status_code','truncated',receipt->'truncated','retainedBodyBytes',coalesce(capture->>'bodyBytes','0')::bigint,'retainedBodySha256',capture->'bodySha256') THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 END IF;
 SELECT * INTO prior FROM aios.http_bootstrap_acceptance WHERE tenant_id=t AND invocation_id=iid;
 IF FOUND THEN IF prior.input_hash IS DISTINCT FROM p->>'inputHash' OR prior.terminal_receipt_id<>terminal THEN RAISE EXCEPTION 'conflict'; END IF;RETURN NEXT prior;RETURN;END IF;
 out_receipt:=(p->>'receiptId')::uuid;body:=(p->>'bodyId')::uuid;obs:=(p->>'observationId')::uuid;
 ids:=CASE WHEN body IS NULL THEN ARRAY[out_receipt] ELSE ARRAY[body,out_receipt] END;
 IF cardinality(ids)<>jsonb_array_length(p->'artifacts') OR (SELECT count(DISTINCT x) FROM unnest(ids) x)<>cardinality(ids) OR obs=ANY(ids) OR body IS NULL AND (capture->'bodySha256' IS DISTINCT FROM 'null'::jsonb OR capture->'bodyBytes' IS DISTINCT FROM 'null'::jsonb) THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 UPDATE aios.knowledge_clock SET seq=knowledge_clock.seq+1,recorded_at=greatest(clock_timestamp(),knowledge_clock.recorded_at) WHERE tenant_id=t RETURNING knowledge_clock.seq,knowledge_clock.recorded_at INTO seq,at_time;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_denied'; END IF;
 INSERT INTO aios.knowledge_commit VALUES(t,seq,at_time);
 common:=jsonb_build_object('schema_version',1,'version',1,'created_at',at_time,'recorded_at',at_time,'updated_at',at_time,'deleted_at',NULL,'retention_class','raw','tenant_id',t,'site_id',s,'knowledge_seq',seq);
 FOR artifact IN SELECT value FROM jsonb_array_elements(p->'artifacts') LOOP
  n:=n+1;
  IF artifact-ARRAY['id','key','sha256','bytes','mime']<>'{}'::jsonb OR (SELECT count(*) FROM jsonb_object_keys(artifact))<>5 OR artifact->>'id' IS DISTINCT FROM ids[n]::text OR artifact->>'key' IS DISTINCT FROM t::text||'/'||s::text||'/'||ids[n]::text OR coalesce(artifact->>'sha256','') !~ '^[a-f0-9]{64}$' OR (artifact->>'bytes')::bigint NOT BETWEEN 0 AND 512000 THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
  IF ids[n]=out_receipt THEN
   IF artifact->>'mime' IS DISTINCT FROM 'application/json' OR artifact->>'sha256' IS DISTINCT FROM encode(sha256(convert_to(p->>'receiptText','UTF8')),'hex') OR (artifact->>'bytes')::bigint<>octet_length(p->>'receiptText') THEN RAISE EXCEPTION 'artifact_integrity_failed'; END IF;
  ELSE
   IF artifact->>'sha256' IS DISTINCT FROM capture->>'bodySha256' OR artifact->>'bytes' IS DISTINCT FROM capture->>'bodyBytes' OR artifact->>'mime' IS DISTINCT FROM (SELECT lower(btrim(split_part(value->>'value',';',1))) FROM jsonb_array_elements(receipt->'headers') WHERE value->>'name'='content-type') THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
  END IF;
  INSERT INTO aios.evidence SELECT (jsonb_populate_record(NULL::aios.evidence,common||jsonb_build_object('record_type','Evidence','id',ids[n],'state','available','artifact_key',artifact->>'key','sha256',artifact->>'sha256','mime_type',artifact->>'mime','bytes',(artifact->>'bytes')::bigint,'captured_at',observed,'source_uri',p->>'sourceUri','source_class','first_party_observation','locator','bytes:0:'||(artifact->>'bytes'),'redaction_version','none-v1','expires_at',observed+interval '7 days'))).*;
  INSERT INTO aios.record_link VALUES(t,ids[n],'provenance_ids',0,(d->>'scopeEvidenceId')::uuid,'Evidence'),(t,ids[n],'provenance_ids',1,(d->>'scopeObservationId')::uuid,'Observation'),(t,ids[n],'provenance_ids',2,(d->>'bundleId')::uuid,'EvidenceBundle');
 END LOOP;
 observation_state:=CASE WHEN receipt->'status_code'='null'::jsonb THEN 'failed' WHEN receipt->'error'<>'null'::jsonb OR (receipt->>'truncated')::boolean THEN 'partial' ELSE 'observed' END;
 INSERT INTO aios.observation SELECT (jsonb_populate_record(NULL::aios.observation,common||jsonb_build_object('record_type','Observation','id',obs,'state',observation_state,'sensor_id','http-fixture','sensor_version','1.0.0','subject_id',s,'observed_at',observed,'window_start',NULL,'window_end',NULL,'source_timezone','UTC','context_hash',encode(sha256(convert_to(p->>'receiptText','UTF8')),'hex'),'fresh_until',least((p->>'freshUntil')::timestamptz,observed+interval '24 hours',(SELECT fresh_until FROM aios.observation WHERE tenant_id=t AND id=(d->>'scopeObservationId')::uuid)),'attempt_id',iid,'error',receipt->'error'))).*;
 FOR n IN 1..cardinality(ids) LOOP INSERT INTO aios.record_link VALUES(t,obs,'evidence_ids',n-1,ids[n],'Evidence');END LOOP;
 INSERT INTO aios.record_link VALUES(t,obs,'provenance_ids',0,(d->>'scopeEvidenceId')::uuid,'Evidence'),(t,obs,'provenance_ids',1,(d->>'scopeObservationId')::uuid,'Observation'),(t,obs,'provenance_ids',2,(d->>'bundleId')::uuid,'EvidenceBundle');
 INSERT INTO aios.http_fixture_acceptance VALUES(t,s,iid,p->>'inputHash',body,out_receipt,obs);
 INSERT INTO aios.acceptance VALUES(t,s,iid,s,p->>'inputHash',out_receipt,obs);
 INSERT INTO aios.http_bootstrap_acceptance VALUES(t,s,r,j,iid,terminal,p->>'inputHash',body,out_receipt,obs);
 event_id:=gen_random_uuid();ev:=jsonb_build_object('event_id',event_id,'tenant_id',t,'site_id',s,'schema_version',1,'aggregate_id',obs,'aggregate_version',1,'causation_id',NULL,'correlation_id',r,'occurred_at',to_char(observed AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'recorded_at',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'knowledge_seq',seq,'idempotency_key',iid::text,'producer','http-bootstrap-fixture@1.0.0','event_type','evidence.recorded','payload',jsonb_build_object('evidence_id',out_receipt,'observation_id',obs));
 INSERT INTO aios.outbox VALUES(t,s,event_id,obs,'evidence.recorded',ev,at_time,NULL);
 RETURN QUERY SELECT * FROM aios.http_bootstrap_acceptance WHERE tenant_id=t AND invocation_id=iid;
END $$;
REVOKE ALL ON FUNCTION control.accept_http_bootstrap_fixture(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.accept_http_bootstrap_fixture(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,text,jsonb) TO aios_http_acceptor;
