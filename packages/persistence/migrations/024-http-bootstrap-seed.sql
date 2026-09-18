SET search_path=aios,pg_catalog;
ALTER TABLE evidence_bundle ADD CONSTRAINT evidence_bundle_scope_identity UNIQUE(tenant_id,site_id,id);
CREATE TABLE http_bootstrap_seed_admission (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,job_id uuid NOT NULL,invocation_id uuid NOT NULL,target_id uuid NOT NULL,bundle_id uuid NOT NULL,
 source_receipt_hash text NOT NULL CHECK(source_receipt_hash ~ '^[a-f0-9]{64}$'),target_version bigint NOT NULL CHECK(target_version>=1),result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=8192),
 PRIMARY KEY(tenant_id,crawl_id),UNIQUE(tenant_id,invocation_id),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),FOREIGN KEY(tenant_id,job_id) REFERENCES job(tenant_id,job_id),
 FOREIGN KEY(tenant_id,invocation_id) REFERENCES http_bootstrap_projection(tenant_id,invocation_id),FOREIGN KEY(tenant_id,site_id,crawl_id,target_id) REFERENCES crawl_target(tenant_id,site_id,crawl_id,id),FOREIGN KEY(tenant_id,site_id,bundle_id) REFERENCES evidence_bundle(tenant_id,site_id,id)
);
ALTER TABLE http_bootstrap_seed_admission ENABLE ROW LEVEL SECURITY;ALTER TABLE http_bootstrap_seed_admission FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON http_bootstrap_seed_admission USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER immutable_http_bootstrap_seed_admission BEFORE UPDATE OR DELETE ON http_bootstrap_seed_admission FOR EACH ROW EXECUTE FUNCTION reject_mutation();
REVOKE ALL ON http_bootstrap_seed_admission FROM PUBLIC,aios_runtime,aios_scheduler,aios_http_supervisor,aios_http_acceptor;
GRANT SELECT ON http_bootstrap_seed_admission TO aios_runtime,aios_scheduler,aios_evaluator;
CREATE FUNCTION control.admit_http_bootstrap_seed(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,seed uuid,seed_version bigint,decision text,receipt_hash text)
RETURNS SETOF aios.http_bootstrap_seed_admission LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p aios.http_bootstrap_projection;accepted aios.http_bootstrap_acceptance;h aios.http_reservation;z aios.http_terminal_receipt;i aios.http_invocation;d jsonb;target aios.crawl_target;prior aios.http_bootstrap_seed_admission;stored_bundle aios.evidence_bundle;scope_receipt aios.site_scope_acceptance;bundle uuid;eids uuid[];oids uuid[];cut_seq bigint;cut_at timestamptz;seq bigint;at_time timestamptz;manifest text;digest text;target_state text;why text;is_admitted boolean;output jsonb;eid uuid;envelope jsonb;n integer;
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 SELECT * INTO p FROM aios.http_bootstrap_projection WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j;
 IF NOT FOUND OR p.receipt_hash IS DISTINCT FROM receipt_hash THEN RAISE EXCEPTION 'bootstrap_incomplete'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.job WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND kind='fetch' AND state='completed' AND result_ref=p.observation_id) THEN RAISE EXCEPTION 'bootstrap_incomplete'; END IF;
 SELECT * INTO h FROM aios.http_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND invocation_id=p.invocation_id AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND settled_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'lease_lost'; END IF;
 PERFORM control.assert_http_bootstrap_context(t,s,r,j,a,h.origin,h.reserved_bytes);
 SELECT * INTO accepted FROM aios.http_bootstrap_acceptance WHERE tenant_id=t AND invocation_id=h.invocation_id AND observation_id=p.observation_id;
 SELECT * INTO z FROM aios.http_terminal_receipt WHERE tenant_id=t AND reservation_id=h.reservation_id AND invocation_id=h.invocation_id AND receipt_id=accepted.terminal_receipt_id;
 SELECT * INTO i FROM aios.http_invocation WHERE tenant_id=t AND reservation_id=h.reservation_id AND invocation_id=h.invocation_id;
 IF accepted.input_hash IS DISTINCT FROM encode(sha256(convert_to('{"imageDigest":'||to_json(i.collector_build_digest)::text||',"inputContextHash":'||to_json(i.input_context_hash)::text||',"resultDigest":'||to_json(z.result_digest)::text||',"terminalReceiptId":'||to_json(accepted.terminal_receipt_id::text)::text||'}','UTF8')),'hex') THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 SELECT descriptor INTO d FROM aios.http_bootstrap_job WHERE tenant_id=t AND job_id=j;
 SELECT * INTO scope_receipt FROM aios.site_scope_acceptance WHERE tenant_id=t AND site_id=s AND crawl_id=r AND evidence_id=(d->>'scopeEvidenceId')::uuid AND observation_id=(d->>'scopeObservationId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_receipt_required'; END IF;
 SELECT * INTO target FROM aios.crawl_target WHERE tenant_id=t AND site_id=s AND crawl_id=r AND id=seed AND seed_kind='submitted' AND depth=0 AND discovered_from_id IS NULL AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR target.url<>target.url_key OR NOT EXISTS(SELECT 1 FROM aios.site WHERE tenant_id=t AND id=s AND submitted_url=target.url AND normalized_origin=h.origin AND deleted_at IS NULL) THEN RAISE EXCEPTION 'seed_unavailable'; END IF;
 SELECT array_agg(id ORDER BY id) INTO eids FROM unnest(ARRAY[scope_receipt.evidence_id,accepted.receipt_evidence_id,accepted.body_evidence_id]) id WHERE id IS NOT NULL;
 SELECT array_agg(id ORDER BY id) INTO oids FROM unnest(ARRAY[scope_receipt.observation_id,accepted.observation_id]) id;
 IF (SELECT count(*) FROM aios.evidence WHERE tenant_id=t AND site_id=s AND id=ANY(eids) AND deleted_at IS NULL AND state='available' AND expires_at>clock_timestamp())<>cardinality(eids) OR (SELECT count(*) FROM aios.observation WHERE tenant_id=t AND site_id=s AND id=ANY(oids) AND deleted_at IS NULL AND fresh_until>clock_timestamp())<>cardinality(oids) OR (p.result->>'freshUntil')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'source_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM aios.fixture_frontier_batch WHERE tenant_id=t AND crawl_id=r AND robots_observation_id<>p.observation_id) OR EXISTS(SELECT 1 FROM aios.fixture_link_batch WHERE tenant_id=t AND crawl_id=r AND robots_observation_id<>p.observation_id) THEN RAISE EXCEPTION 'robots_context_conflict'; END IF;
 SELECT * INTO prior FROM aios.http_bootstrap_seed_admission WHERE tenant_id=t AND crawl_id=r;
 IF FOUND THEN
  IF prior.job_id<>j OR prior.invocation_id<>p.invocation_id OR prior.target_id<>seed OR prior.source_receipt_hash<>receipt_hash OR NOT EXISTS(SELECT 1 FROM aios.evidence_bundle WHERE tenant_id=t AND site_id=s AND id=prior.bundle_id AND state='frozen' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'conflict'; END IF;
  IF target.version<prior.target_version OR (SELECT count(*) FROM aios.record_link WHERE tenant_id=t AND owner_id=seed)<>3 OR NOT EXISTS(SELECT 1 FROM aios.record_link WHERE tenant_id=t AND owner_id=seed AND field_name='provenance_ids' AND ordinal=0 AND target_id=scope_receipt.observation_id AND target_type='Observation') OR NOT EXISTS(SELECT 1 FROM aios.record_link WHERE tenant_id=t AND owner_id=seed AND field_name='provenance_ids' AND ordinal=1 AND target_id=accepted.observation_id AND target_type='Observation') OR NOT EXISTS(SELECT 1 FROM aios.record_link WHERE tenant_id=t AND owner_id=seed AND field_name='provenance_ids' AND ordinal=2 AND target_id=prior.bundle_id AND target_type='EvidenceBundle') THEN RAISE EXCEPTION 'artifact_integrity_failed'; END IF;
  SELECT * INTO stored_bundle FROM aios.evidence_bundle WHERE tenant_id=t AND site_id=s AND id=prior.bundle_id;
  manifest:='{"assertion_ids":[],"evidence_ids":'||array_to_json(eids)::text||',"known_at":'||to_json(to_char(stored_bundle.known_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text||',"known_seq":'||stored_bundle.known_seq::text||',"observation_ids":'||array_to_json(oids)::text||'}';
  IF stored_bundle.manifest_hash IS DISTINCT FROM encode(sha256(convert_to(manifest,'UTF8')),'hex') OR NOT EXISTS(SELECT 1 FROM aios.knowledge_commit kc WHERE kc.tenant_id=t AND kc.seq=stored_bundle.known_seq AND date_trunc('milliseconds',kc.recorded_at)=stored_bundle.known_at) OR (SELECT count(*) FROM aios.record_link WHERE tenant_id=t AND owner_id=prior.bundle_id)<>cardinality(eids)+cardinality(oids) OR (SELECT count(*) FROM aios.record_link WHERE tenant_id=t AND owner_id=prior.bundle_id AND field_name='evidence_ids' AND target_id=ANY(eids) AND target_type='Evidence')<>cardinality(eids) OR (SELECT count(*) FROM aios.record_link WHERE tenant_id=t AND owner_id=prior.bundle_id AND field_name='observation_ids' AND target_id=ANY(oids) AND target_type='Observation')<>cardinality(oids) OR EXISTS(SELECT 1 FROM aios.evidence WHERE tenant_id=t AND id=ANY(eids) AND knowledge_seq>stored_bundle.known_seq) OR EXISTS(SELECT 1 FROM aios.observation WHERE tenant_id=t AND id=ANY(oids) AND knowledge_seq>stored_bundle.known_seq) THEN RAISE EXCEPTION 'artifact_integrity_failed'; END IF;
  RETURN NEXT prior;RETURN;
 END IF;
 IF target.version<>seed_version OR target.state<>'discovered' OR target.admitted OR target.attempts<>0 OR EXISTS(SELECT 1 FROM aios.record_link WHERE tenant_id=t AND owner_id=seed) THEN RAISE EXCEPTION 'seed_already_classified'; END IF;
 IF decision IS NULL OR decision NOT IN ('allowed','disallowed','denied','unknown') OR p.result->>'state' IS DISTINCT FROM (CASE WHEN decision IN ('allowed','disallowed') THEN 'known' ELSE decision END) THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 is_admitted:=false;
 IF decision='allowed' THEN
  IF (SELECT count(*) FROM aios.crawl_target WHERE tenant_id=t AND crawl_id=r AND admitted)>=500 THEN target_state:='deferred';why:='admission_budget';
  ELSE target_state:='queued';why:=NULL;is_admitted:=true; END IF;
 ELSIF decision='unknown' THEN target_state:='deferred';why:='robots_unknown';
 ELSE target_state:='excluded';why:=CASE WHEN decision='denied' THEN 'robots_denied' ELSE 'robots_disallowed' END; END IF;
 SELECT knowledge_clock.seq,date_trunc('milliseconds',knowledge_clock.recorded_at) INTO cut_seq,cut_at FROM aios.knowledge_clock WHERE tenant_id=t FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_denied'; END IF;
 IF EXISTS(SELECT 1 FROM aios.evidence WHERE tenant_id=t AND id=ANY(eids) AND knowledge_seq>cut_seq) OR EXISTS(SELECT 1 FROM aios.observation WHERE tenant_id=t AND id=ANY(oids) AND knowledge_seq>cut_seq) THEN RAISE EXCEPTION 'invalid_cutoff'; END IF;
 manifest:='{"assertion_ids":[],"evidence_ids":'||array_to_json(eids)::text||',"known_at":'||to_json(to_char(cut_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text||',"known_seq":'||cut_seq::text||',"observation_ids":'||array_to_json(oids)::text||'}';
 digest:=encode(sha256(convert_to(manifest,'UTF8')),'hex');bundle:=gen_random_uuid();
 UPDATE aios.knowledge_clock SET seq=knowledge_clock.seq+1,recorded_at=greatest(clock_timestamp(),knowledge_clock.recorded_at) WHERE tenant_id=t RETURNING knowledge_clock.seq,knowledge_clock.recorded_at INTO seq,at_time;
 INSERT INTO aios.knowledge_commit VALUES(t,seq,at_time);
 INSERT INTO aios.evidence_bundle VALUES('EvidenceBundle',bundle,1,1,at_time,at_time,at_time,NULL,'frozen','derived',t,s,cut_at,digest,seq,cut_seq);
 FOR n IN 1..cardinality(eids) LOOP INSERT INTO aios.record_link VALUES(t,bundle,'evidence_ids',n-1,eids[n],'Evidence');END LOOP;
 FOR n IN 1..cardinality(oids) LOOP INSERT INTO aios.record_link VALUES(t,bundle,'observation_ids',n-1,oids[n],'Observation');END LOOP;
 UPDATE aios.crawl_target SET state=target_state,admitted=is_admitted,reason=why,version=version+1,updated_at=at_time,knowledge_seq=seq WHERE tenant_id=t AND id=seed;
 INSERT INTO aios.record_link VALUES(t,seed,'provenance_ids',0,scope_receipt.observation_id,'Observation'),(t,seed,'provenance_ids',1,accepted.observation_id,'Observation'),(t,seed,'provenance_ids',2,bundle,'EvidenceBundle');
 output:=jsonb_build_object('invocationId',p.invocation_id,'observationId',accepted.observation_id,'targetId',seed,'bundleId',bundle,'state',target_state,'admitted',is_admitted,'reason',why,'policyVersion','discovery-v1');
 INSERT INTO aios.http_bootstrap_seed_admission VALUES(t,s,r,j,p.invocation_id,seed,bundle,receipt_hash,target.version+1,output);
 eid:=gen_random_uuid();envelope:=jsonb_build_object('event_id',eid,'tenant_id',t,'site_id',s,'aggregate_id',seed,'causation_id',NULL,'correlation_id',r,'recorded_at',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'knowledge_seq',seq,'producer','http-bootstrap-seed@1.0.0','schema_version',1,'aggregate_version',target.version+1,'idempotency_key',p.invocation_id::text||':seed.classified','occurred_at',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'event_type','frontier.seed_classified','payload',jsonb_build_object('crawl_id',r,'invocation_id',p.invocation_id,'robots_observation_id',accepted.observation_id,'target_id',seed,'bundle_id',bundle,'state',target_state,'admitted',is_admitted,'reason',why,'policy_version','discovery-v1'));
 INSERT INTO aios.outbox VALUES(t,s,eid,seed,'frontier.seed_classified',envelope,at_time,NULL);
 RETURN QUERY SELECT * FROM aios.http_bootstrap_seed_admission WHERE tenant_id=t AND crawl_id=r;
END $$;
REVOKE ALL ON FUNCTION control.admit_http_bootstrap_seed(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.admit_http_bootstrap_seed(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,bigint,text,text) TO aios_scheduler;

-- All three local classification paths preserve one robots interpretation.
CREATE OR REPLACE FUNCTION aios.guard_frontier_robots_context() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(68273433);
 IF EXISTS(SELECT 1 FROM aios.fixture_frontier_batch WHERE tenant_id=NEW.tenant_id AND crawl_id=NEW.crawl_id AND robots_observation_id<>NEW.robots_observation_id) OR EXISTS(SELECT 1 FROM aios.fixture_link_batch WHERE tenant_id=NEW.tenant_id AND crawl_id=NEW.crawl_id AND robots_observation_id<>NEW.robots_observation_id) OR EXISTS(SELECT 1 FROM aios.http_bootstrap_seed_admission WHERE tenant_id=NEW.tenant_id AND crawl_id=NEW.crawl_id AND result->>'observationId'<>NEW.robots_observation_id::text) THEN RAISE EXCEPTION 'robots_context_conflict'; END IF;
 RETURN NEW;
END $$;
