SET search_path=aios,pg_catalog;
CREATE TABLE http_seed_job (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,job_id uuid NOT NULL,parent_job_id uuid NOT NULL,target_id uuid NOT NULL,bundle_id uuid NOT NULL,
 descriptor jsonb NOT NULL CHECK(jsonb_typeof(descriptor)='object' AND octet_length(descriptor::text)<=16384),
 PRIMARY KEY(tenant_id,job_id),UNIQUE(tenant_id,target_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES job(tenant_id,job_id),FOREIGN KEY(tenant_id,parent_job_id) REFERENCES job(tenant_id,job_id),
 FOREIGN KEY(tenant_id,site_id,crawl_id,target_id) REFERENCES crawl_target(tenant_id,site_id,crawl_id,id),FOREIGN KEY(tenant_id,site_id,bundle_id) REFERENCES evidence_bundle(tenant_id,site_id,id)
);
CREATE TABLE http_seed_claim (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,job_id uuid NOT NULL,target_id uuid NOT NULL,reservation_id uuid NOT NULL,invocation_id uuid NOT NULL,attempt_no integer NOT NULL,attempt_id uuid NOT NULL,lease_token uuid NOT NULL,
 PRIMARY KEY(tenant_id,target_id),UNIQUE(tenant_id,job_id),UNIQUE(tenant_id,reservation_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES http_seed_job(tenant_id,job_id),FOREIGN KEY(tenant_id,reservation_id) REFERENCES http_reservation(tenant_id,reservation_id)
);
ALTER TABLE http_seed_job ENABLE ROW LEVEL SECURITY;ALTER TABLE http_seed_job FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON http_seed_job USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER immutable_http_seed_job BEFORE UPDATE OR DELETE ON http_seed_job FOR EACH ROW EXECUTE FUNCTION reject_mutation();
REVOKE ALL ON http_seed_job FROM PUBLIC,aios_runtime,aios_scheduler,aios_http_supervisor,aios_http_acceptor;
GRANT SELECT ON http_seed_job TO aios_scheduler;
ALTER TABLE http_seed_claim ENABLE ROW LEVEL SECURITY;ALTER TABLE http_seed_claim FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON http_seed_claim USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER immutable_http_seed_claim BEFORE UPDATE OR DELETE ON http_seed_claim FOR EACH ROW EXECUTE FUNCTION reject_mutation();
REVOKE ALL ON http_seed_claim FROM PUBLIC,aios_runtime,aios_scheduler,aios_http_supervisor,aios_http_acceptor;
GRANT SELECT ON http_seed_claim TO aios_scheduler;
CREATE FUNCTION control.assert_http_seed_release(d text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m jsonb;
BEGIN
 SELECT manifest INTO m FROM control.release WHERE digest=d AND profile='local-synthetic-v1';
 IF m IS NULL OR m->>'output_schema' IS DISTINCT FROM 'https://schemas.aios-seo.invalid/v1/http-seed-execution.schema.json' OR m->>'external_authority' IS DISTINCT FROM 'read_only' OR jsonb_array_length(m->'procedure')<>1 OR m->'procedure'->0->>'operation' IS DISTINCT FROM 'http_seed_fixture_v1' OR m->'procedure'->0->>'executor' IS DISTINCT FROM 'deterministic' OR m->'procedure'->0->>'tool_id' IS DISTINCT FROM 'http.fetch_public' OR m->'procedure'->0->'input_kinds' IS DISTINCT FROM '["site_scope","robots_policy","crawl_target"]'::jsonb OR m->'procedure'->0->>'output_kind' IS DISTINCT FROM 'http_seed_receipt' OR m->'procedure'->0->>'on_failure' IS DISTINCT FROM 'abstain' OR jsonb_array_length(m->'tool_permissions')<>1 OR NOT m->'tool_permissions' @> '[{"tool_id":"http.fetch_public","version":"1.0.0","max_calls":1}]'::jsonb OR NOT m->'policy_constraints' @> '["local-synthetic-v1","discovery-v1"]'::jsonb THEN RAISE EXCEPTION 'handler_not_installed'; END IF;
END $$;
REVOKE ALL ON FUNCTION control.assert_http_seed_release(text) FROM PUBLIC;
ALTER FUNCTION control.assert_http_bootstrap_context(uuid,uuid,uuid,uuid,integer,text,bigint) RENAME TO assert_http_bootstrap_context_internal;
CREATE FUNCTION control.assert_http_seed_source(t uuid,s uuid,r uuid,d jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE admission aios.http_bootstrap_seed_admission;p aios.http_bootstrap_projection;h aios.http_reservation;e aios.evidence;o aios.observation;z record;
BEGIN
 SELECT * INTO admission FROM aios.http_bootstrap_seed_admission WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=(d->>'parentJobId')::uuid AND invocation_id=(d->>'bootstrapInvocationId')::uuid AND target_id=(d->>'targetId')::uuid AND bundle_id=(d->>'bundleId')::uuid;
 IF NOT FOUND OR admission.result->>'state'<>'queued' OR admission.result->>'admitted'<>'true' OR admission.target_version::text IS DISTINCT FROM d->>'targetVersion' THEN RAISE EXCEPTION 'seed_not_admitted';END IF;
 PERFORM control.assert_http_admission(t,s,r,admission.job_id);
 SELECT * INTO p FROM aios.http_bootstrap_projection WHERE tenant_id=t AND job_id=admission.job_id AND invocation_id=admission.invocation_id;
 IF NOT FOUND OR p.result->>'state'<>'known' OR p.observation_id::text IS DISTINCT FROM d->>'robotsObservationId' OR p.receipt_hash IS DISTINCT FROM d->>'robotsContextHash' OR p.result->>'receiptEvidenceId' IS DISTINCT FROM d->>'robotsReceiptEvidenceId' OR p.result->>'bodyEvidenceId' IS DISTINCT FROM d->>'robotsBodyEvidenceId' OR (p.result->>'freshUntil')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'source_unavailable';END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.job WHERE tenant_id=t AND job_id=admission.job_id AND state='completed' AND result_ref=p.observation_id) THEN RAISE EXCEPTION 'bootstrap_incomplete';END IF;
 SELECT * INTO h FROM aios.http_reservation WHERE tenant_id=t AND job_id=admission.job_id AND invocation_id=admission.invocation_id AND attempt_no=(d->>'parentAttempt')::integer AND attempt_id=(d->>'parentAttemptId')::uuid AND settled_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'lease_lost';END IF;
 PERFORM control.assert_http_bootstrap_context_internal(t,s,r,admission.job_id,h.attempt_no,h.origin,h.reserved_bytes);
 IF NOT EXISTS(SELECT 1 FROM aios.site_scope_acceptance x JOIN aios.evidence y ON y.tenant_id=x.tenant_id AND y.id=x.evidence_id JOIN aios.observation q ON q.tenant_id=x.tenant_id AND q.id=x.observation_id WHERE x.tenant_id=t AND x.site_id=s AND x.crawl_id=r AND x.evidence_id::text=d->>'scopeEvidenceId' AND x.observation_id::text=d->>'scopeObservationId' AND y.sha256=d->>'scopeSha256' AND y.state='available' AND y.deleted_at IS NULL AND y.expires_at>clock_timestamp() AND q.deleted_at IS NULL AND q.fresh_until>clock_timestamp()) THEN RAISE EXCEPTION 'scope_receipt_required';END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.evidence_bundle WHERE tenant_id=t AND site_id=s AND id=admission.bundle_id AND state='frozen' AND deleted_at IS NULL AND known_seq::text=d->>'knownSeq') THEN RAISE EXCEPTION 'bundle_membership_required';END IF;
 FOR z IN SELECT value FROM jsonb_array_elements_text(jsonb_build_array(d->>'scopeEvidenceId',d->>'robotsReceiptEvidenceId',d->>'robotsBodyEvidenceId')) WHERE value IS NOT NULL LOOP
  SELECT * INTO e FROM aios.evidence WHERE tenant_id=t AND site_id=s AND id=z.value::uuid AND deleted_at IS NULL AND state='available' AND expires_at>clock_timestamp();
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM aios.record_link WHERE tenant_id=t AND owner_id=admission.bundle_id AND field_name='evidence_ids' AND target_id=e.id) THEN RAISE EXCEPTION 'source_unavailable';END IF;
 END LOOP;
 SELECT * INTO o FROM aios.observation WHERE tenant_id=t AND site_id=s AND id=p.observation_id AND deleted_at IS NULL AND fresh_until>clock_timestamp() AND observed_at>clock_timestamp()-interval '24 hours';
 IF NOT FOUND THEN RAISE EXCEPTION 'source_unavailable';END IF;
 IF d->>'handler' IS DISTINCT FROM 'http_seed_fixture_v1' OR d->>'profile' IS DISTINCT FROM 'isolated-http-seed-fixture-v1' OR d->>'policy' IS DISTINCT FROM 'discovery-v1' OR d->>'method' IS DISTINCT FROM 'GET' OR d->>'maxDecodedBytes' IS DISTINCT FROM '5242880' OR d->>'timeoutMs' IS DISTINCT FROM '20000' OR d->>'tenantId' IS DISTINCT FROM t::text OR d->>'siteId' IS DISTINCT FROM s::text OR d->>'crawlId' IS DISTINCT FROM r::text OR NOT EXISTS(SELECT 1 FROM aios.site WHERE tenant_id=t AND id=s AND normalized_origin=d->>'origin' AND submitted_url=d->>'url' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'scope_denied';END IF;
END $$;
REVOKE ALL ON FUNCTION control.assert_http_seed_source(uuid,uuid,uuid,jsonb) FROM PUBLIC;
CREATE FUNCTION control.assert_http_bootstrap_context(t uuid,s uuid,r uuid,j uuid,a integer,wanted_origin text,bytes bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE x aios.job;d jsonb;target aios.crawl_target;claim aios.http_seed_claim;
BEGIN
 SELECT descriptor INTO d FROM aios.http_seed_job WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j;
 IF NOT FOUND THEN PERFORM control.assert_http_bootstrap_context_internal(t,s,r,j,a,wanted_origin,bytes);RETURN;END IF;
 SELECT * INTO x FROM aios.job WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND kind='fetch';
 PERFORM control.assert_http_seed_release(x.release_digest);PERFORM control.assert_http_seed_source(t,s,r,d);
 IF bytes<>5242880 OR wanted_origin IS DISTINCT FROM d->>'origin' OR x.input_ref::text IS DISTINCT FROM d->>'bundleId' THEN RAISE EXCEPTION 'scope_denied';END IF;
 IF EXISTS(SELECT 1 FROM aios.http_reservation WHERE tenant_id=t AND job_id=j AND attempt_no<>a) THEN RAISE EXCEPTION 'budget_exhausted';END IF;
 SELECT * INTO target FROM aios.crawl_target WHERE tenant_id=t AND site_id=s AND crawl_id=r AND id=(d->>'targetId')::uuid AND seed_kind='submitted' AND deleted_at IS NULL;
 IF NOT FOUND OR NOT target.admitted OR target.url IS DISTINCT FROM d->>'url' THEN RAISE EXCEPTION 'target_unavailable';END IF;
 SELECT * INTO claim FROM aios.http_seed_claim WHERE tenant_id=t AND target_id=target.id;
 IF FOUND THEN
  IF claim.job_id<>j OR claim.attempt_no<>a OR target.state<>'fetching' OR target.attempts<>1 OR target.version<>(d->>'targetVersion')::bigint+1 THEN RAISE EXCEPTION 'target_claimed';END IF;
 ELSE
  IF target.state<>'queued' OR target.attempts<>0 OR target.version<>(d->>'targetVersion')::bigint THEN RAISE EXCEPTION 'target_unavailable';END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION control.assert_http_bootstrap_context(uuid,uuid,uuid,uuid,integer,text,bigint) FROM PUBLIC;
CREATE FUNCTION control.enqueue_http_seed(t uuid,s uuid,r uuid,parent uuid,a integer,aid uuid,tok uuid,release text,key text,d jsonb,expected text,id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior aios.job;target aios.crawl_target;dep record;
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required';END IF;
 PERFORM control.assert_http_seed_source(t,s,r,d);PERFORM control.assert_http_seed_release(release);
 IF d->>'parentJobId' IS DISTINCT FROM parent::text OR d->>'parentAttemptId' IS DISTINCT FROM aid::text OR d->>'parentAttempt' IS DISTINCT FROM a::text OR key IS NULL OR length(key) NOT BETWEEN 1 AND 4096 OR expected !~ '^[a-f0-9]{64}$' OR NOT EXISTS(SELECT 1 FROM aios.http_reservation WHERE tenant_id=t AND job_id=parent AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND invocation_id::text=d->>'bootstrapInvocationId') THEN RAISE EXCEPTION 'lease_lost';END IF;
 FOR dep IN WITH RECURSIVE deps(digest) AS (SELECT release UNION SELECT x.dependency FROM control.release_dependency x JOIN deps ON x.digest=deps.digest) SELECT x.digest,z.status,x.fresh_until,k.active FROM deps JOIN control.release x ON x.digest=deps.digest LEFT JOIN control.authority_key k ON k.reviewer=(x.approval->>'reviewer')::uuid LEFT JOIN LATERAL(SELECT status FROM control.release_state WHERE digest=x.digest ORDER BY generation DESC LIMIT 1)z ON true LOOP
 IF dep.status IS DISTINCT FROM 'approved' OR dep.active IS DISTINCT FROM true OR dep.fresh_until<=clock_timestamp() THEN RAISE EXCEPTION 'skill_revoked';END IF;END LOOP;
 SELECT q.* INTO prior FROM aios.job q JOIN aios.http_seed_job h ON h.tenant_id=q.tenant_id AND h.job_id=q.job_id WHERE h.tenant_id=t AND h.target_id=(d->>'targetId')::uuid;
 IF FOUND THEN IF prior.expected_input_hash IS DISTINCT FROM expected OR prior.idempotency_key IS DISTINCT FROM key THEN RAISE EXCEPTION 'conflict';END IF;RETURN prior.job_id;END IF;
 IF EXISTS(SELECT 1 FROM aios.job WHERE tenant_id=t AND crawl_id=r AND idempotency_key=key) THEN RAISE EXCEPTION 'conflict';END IF;
 SELECT ct.* INTO target FROM aios.crawl_target ct WHERE ct.tenant_id=t AND ct.site_id=s AND ct.crawl_id=r AND ct.id=(d->>'targetId')::uuid AND admitted AND state='queued' AND attempts=0 AND version=(d->>'targetVersion')::bigint AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'target_unavailable';END IF;
 INSERT INTO aios.job(tenant_id,site_id,crawl_id,job_id,kind,state,input_ref,expected_input_hash,idempotency_key,available_at,deadline,release_digest,release_generation)
 SELECT t,s,r,id,'fetch','queued',(d->>'bundleId')::uuid,expected,key,clock_timestamp(),p.deadline,release,generation FROM control.release_state z CROSS JOIN aios.job p WHERE z.digest=release AND p.tenant_id=t AND p.job_id=parent ORDER BY generation DESC LIMIT 1;
 INSERT INTO aios.http_seed_job VALUES(t,s,r,id,parent,target.id,(d->>'bundleId')::uuid,d);
 INSERT INTO aios.job_release WITH RECURSIVE deps(digest) AS (SELECT release UNION SELECT x.dependency FROM control.release_dependency x JOIN deps ON x.digest=deps.digest) SELECT t,id,deps.digest,z.generation FROM deps JOIN LATERAL(SELECT generation FROM control.release_state WHERE digest=deps.digest ORDER BY generation DESC LIMIT 1)z ON true;
 RETURN id;
END $$;
REVOKE ALL ON FUNCTION control.enqueue_http_seed(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,text,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.enqueue_http_seed(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,text,jsonb,text,uuid) TO aios_scheduler;
CREATE OR REPLACE FUNCTION aios.guard_http_bootstrap_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable_http_descriptor';END IF;
 IF TG_TABLE_NAME='http_bootstrap_job' THEN RAISE EXCEPTION 'immutable_http_descriptor';END IF;
 IF TG_OP='UPDATE' AND (OLD.kind='fetch' OR NEW.kind='fetch') AND (OLD.kind,OLD.tenant_id,OLD.site_id,OLD.crawl_id,OLD.job_id,OLD.input_ref,OLD.expected_input_hash,OLD.release_digest,OLD.release_generation,OLD.idempotency_key) IS DISTINCT FROM (NEW.kind,NEW.tenant_id,NEW.site_id,NEW.crawl_id,NEW.job_id,NEW.input_ref,NEW.expected_input_hash,NEW.release_digest,NEW.release_generation,NEW.idempotency_key) THEN RAISE EXCEPTION 'immutable_http_descriptor';END IF;
 IF NEW.kind='fetch' AND (NEW.state='completed' OR NEW.result_ref IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM aios.http_bootstrap_projection p WHERE p.tenant_id=NEW.tenant_id AND p.site_id=NEW.site_id AND p.crawl_id=NEW.crawl_id AND p.job_id=NEW.job_id AND p.observation_id=NEW.result_ref AND NEW.state='completed' AND NEW.lease_token IS NULL AND NEW.lease_until IS NULL AND p.created_xid=pg_current_xact_id()) THEN RAISE EXCEPTION 'handler_not_installed';END IF;
 IF TG_OP='UPDATE' AND OLD.kind='fetch' AND OLD.state='completed' THEN RAISE EXCEPTION 'immutable_http_completion';END IF;
 IF NEW.kind='fetch' AND NOT EXISTS(SELECT 1 FROM aios.http_bootstrap_job WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) AND NOT EXISTS(SELECT 1 FROM aios.http_seed_job WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'http_descriptor_required';END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION control.reserve_http_accounting(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,wanted_origin text,bytes bigint,rid uuid,receipt_hash text)
RETURNS SETOF aios.http_reservation LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h aios.http_reservation;d jsonb;seq bigint;at_time timestamptz;eid uuid;envelope jsonb;
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required';END IF;
 PERFORM control.assert_http_admission(t,s,r,j);PERFORM control.assert_http_bootstrap_context(t,s,r,j,a,wanted_origin,bytes);
 SELECT * INTO h FROM control.reserve_http_accounting_internal(t,s,r,j,a,aid,tok,wanted_origin,bytes,rid,receipt_hash);
 SELECT descriptor INTO d FROM aios.http_seed_job WHERE tenant_id=t AND job_id=j;
 IF FOUND AND NOT EXISTS(SELECT 1 FROM aios.http_seed_claim WHERE tenant_id=t AND target_id=(d->>'targetId')::uuid) THEN
  UPDATE aios.knowledge_clock SET seq=knowledge_clock.seq+1,recorded_at=greatest(clock_timestamp(),knowledge_clock.recorded_at) WHERE tenant_id=t RETURNING knowledge_clock.seq,knowledge_clock.recorded_at INTO seq,at_time;
  INSERT INTO aios.knowledge_commit VALUES(t,seq,at_time);
  UPDATE aios.crawl_target SET state='fetching',attempts=attempts+1,version=version+1,updated_at=at_time,knowledge_seq=seq WHERE tenant_id=t AND site_id=s AND crawl_id=r AND id=(d->>'targetId')::uuid AND state='queued' AND admitted AND attempts=0 AND version=(d->>'targetVersion')::bigint;
  IF NOT FOUND THEN RAISE EXCEPTION 'target_claimed';END IF;
  INSERT INTO aios.http_seed_claim VALUES(t,s,r,j,(d->>'targetId')::uuid,h.reservation_id,h.invocation_id,a,aid,tok);
  eid:=gen_random_uuid();envelope:=jsonb_build_object('event_id',eid,'tenant_id',t,'site_id',s,'aggregate_id',(d->>'targetId')::uuid,'causation_id',NULL,'correlation_id',r,'recorded_at',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'knowledge_seq',seq,'producer','http-seed-dispatch@1.0.0','schema_version',1,'aggregate_version',(d->>'targetVersion')::bigint+1,'idempotency_key',h.invocation_id::text||':seed.fetch_claimed','occurred_at',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'event_type','frontier.seed_fetch_claimed','payload',jsonb_build_object('crawl_id',r,'target_id',(d->>'targetId')::uuid,'job_id',j,'invocation_id',h.invocation_id,'reservation_id',h.reservation_id,'policy_version','discovery-v1'));
  INSERT INTO aios.outbox VALUES(t,s,eid,(d->>'targetId')::uuid,'frontier.seed_fetch_claimed',envelope,at_time,NULL);
 END IF;
 RETURN NEXT h;
END $$;
