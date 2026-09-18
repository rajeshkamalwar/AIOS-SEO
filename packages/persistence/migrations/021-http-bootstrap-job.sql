SET search_path=aios,pg_catalog;
CREATE TABLE http_bootstrap_job (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,job_id uuid NOT NULL,
 parent_job_id uuid NOT NULL,scope_evidence_id uuid NOT NULL,bundle_id uuid NOT NULL,
 descriptor jsonb NOT NULL CHECK(jsonb_typeof(descriptor)='object' AND octet_length(descriptor::text)<=16384),
 PRIMARY KEY(tenant_id,job_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES job(tenant_id,job_id),
 FOREIGN KEY(tenant_id,parent_job_id) REFERENCES job(tenant_id,job_id),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,scope_evidence_id) REFERENCES evidence(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,bundle_id) REFERENCES evidence_bundle(tenant_id,id)
);
ALTER TABLE http_bootstrap_job ENABLE ROW LEVEL SECURITY;ALTER TABLE http_bootstrap_job FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON http_bootstrap_job USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
REVOKE ALL ON http_bootstrap_job FROM PUBLIC,aios_runtime,aios_scheduler,aios_http_supervisor;
GRANT SELECT ON http_bootstrap_job TO aios_scheduler;
CREATE FUNCTION control.assert_http_bootstrap_release(d text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m jsonb;
BEGIN
 SELECT manifest INTO m FROM control.release WHERE digest=d AND profile='local-synthetic-v1';
 IF m IS NULL OR m->>'output_schema' IS DISTINCT FROM 'https://schemas.aios-seo.invalid/v1/http-bootstrap-execution.schema.json' OR m->>'external_authority' IS DISTINCT FROM 'read_only' OR jsonb_array_length(m->'procedure')<>1 OR m->'procedure'->0->>'operation' IS DISTINCT FROM 'http_bootstrap_fixture_v1' OR m->'procedure'->0->>'executor' IS DISTINCT FROM 'deterministic' OR m->'procedure'->0->>'tool_id' IS DISTINCT FROM 'http.fetch_public' OR m->'procedure'->0->'input_kinds' IS DISTINCT FROM '["site_scope"]'::jsonb OR m->'procedure'->0->>'output_kind' IS DISTINCT FROM 'http_bootstrap_receipt' OR m->'procedure'->0->>'on_failure' IS DISTINCT FROM 'abstain' OR jsonb_array_length(m->'tool_permissions')<>1 OR NOT m->'tool_permissions' @> '[{"tool_id":"http.fetch_public","version":"1.0.0","max_calls":1}]'::jsonb OR NOT m->'policy_constraints' @> '["local-synthetic-v1","discovery-v1"]'::jsonb THEN RAISE EXCEPTION 'handler_not_installed'; END IF;
END $$;
REVOKE ALL ON FUNCTION control.assert_http_bootstrap_release(text) FROM PUBLIC;
CREATE FUNCTION control.enqueue_http_bootstrap(t uuid,s uuid,r uuid,parent uuid,a integer,aid uuid,tok uuid,release text,key text,d jsonb,expected text,id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p aios.job;prior aios.job;dep record;
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,parent);
 SELECT * INTO p FROM aios.job WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=parent AND kind='project' AND state='leased' AND attempt=a AND lease_token=tok AND lease_until>clock_timestamp() AND deadline>clock_timestamp();
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM aios.job_attempt WHERE tenant_id=t AND job_id=parent AND attempt_no=a AND attempt_id=aid) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.tenant z WHERE z.id=t AND z.policy_profile_id='local-synthetic-v1') THEN RAISE EXCEPTION 'policy_blocked'; END IF;
 PERFORM control.assert_http_bootstrap_release(release);
 IF expected IS NULL OR expected !~ '^[a-f0-9]{64}$' OR key IS NULL OR length(key) NOT BETWEEN 1 AND 4096 OR d->>'version' IS DISTINCT FROM '1' OR d->>'handler' IS DISTINCT FROM 'http_bootstrap_fixture_v1' OR d->>'policy' IS DISTINCT FROM 'discovery-v1' OR d->>'profile' IS DISTINCT FROM 'isolated-http-fixture-v1' OR d->>'parentJobId' IS DISTINCT FROM parent::text OR d->>'parentAttemptId' IS DISTINCT FROM aid::text OR d->>'parentAttempt' IS DISTINCT FROM a::text OR d->>'tenantId' IS DISTINCT FROM t::text OR d->>'siteId' IS DISTINCT FROM s::text OR d->>'crawlId' IS DISTINCT FROM r::text OR d->>'bundleId' IS DISTINCT FROM p.input_ref::text OR coalesce(d->>'scopeSha256','') !~ '^[a-f0-9]{64}$' OR coalesce(d->>'sourceContextHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_input'; END IF;
 IF d->>'method' IS DISTINCT FROM 'GET' OR d->>'maxDecodedBytes' IS DISTINCT FROM '512000' OR d->>'timeoutMs' IS DISTINCT FROM '20000' OR NOT EXISTS(SELECT 1 FROM aios.site z WHERE z.tenant_id=t AND z.id=s AND z.normalized_origin=d->>'origin' AND d->>'url'=z.normalized_origin||'/robots.txt') THEN RAISE EXCEPTION 'scope_denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.site_scope_acceptance z JOIN aios.evidence e ON e.tenant_id=z.tenant_id AND e.id=z.evidence_id JOIN aios.evidence_bundle b ON b.tenant_id=z.tenant_id AND b.site_id=z.site_id AND b.id=p.input_ref JOIN aios.observation o ON o.tenant_id=z.tenant_id AND o.id=z.observation_id WHERE z.tenant_id=t AND z.site_id=s AND z.crawl_id=r AND z.evidence_id=(d->>'scopeEvidenceId')::uuid AND z.observation_id=(d->>'scopeObservationId')::uuid AND e.sha256=d->>'scopeSha256' AND e.state='available' AND e.expires_at>clock_timestamp() AND e.deleted_at IS NULL AND o.state='observed' AND o.fresh_until>clock_timestamp() AND o.deleted_at IS NULL AND b.state='frozen' AND b.deleted_at IS NULL AND e.knowledge_seq<=b.known_seq AND o.knowledge_seq<=b.known_seq AND d->>'knownSeq'=b.known_seq::text
 AND EXISTS(SELECT 1 FROM aios.record_link q WHERE q.tenant_id=t AND q.owner_id=b.id AND q.field_name='evidence_ids' AND q.target_id=e.id)
 AND EXISTS(SELECT 1 FROM aios.record_link q WHERE q.tenant_id=t AND q.owner_id=b.id AND q.field_name='observation_ids' AND q.target_id=o.id)) THEN RAISE EXCEPTION 'scope_receipt_required'; END IF;
 FOR dep IN WITH RECURSIVE deps(digest) AS (SELECT release UNION SELECT x.dependency FROM control.release_dependency x JOIN deps ON x.digest=deps.digest)
 SELECT x.digest,z.generation,z.status,x.fresh_until,k.active FROM deps JOIN control.release x ON x.digest=deps.digest LEFT JOIN control.authority_key k ON k.reviewer=(x.approval->>'reviewer')::uuid LEFT JOIN LATERAL(SELECT generation,status FROM control.release_state WHERE digest=x.digest ORDER BY generation DESC LIMIT 1)z ON true LOOP
  IF dep.status IS DISTINCT FROM 'approved' OR dep.active IS DISTINCT FROM true OR dep.fresh_until<=clock_timestamp() THEN RAISE EXCEPTION 'skill_revoked'; END IF;
 END LOOP;
 SELECT * INTO prior FROM aios.job WHERE tenant_id=t AND crawl_id=r AND idempotency_key=key;
 IF FOUND THEN IF prior.expected_input_hash IS DISTINCT FROM expected THEN RAISE EXCEPTION 'conflict';END IF; RETURN prior.job_id;END IF;
 INSERT INTO aios.job(tenant_id,site_id,crawl_id,job_id,kind,state,input_ref,expected_input_hash,idempotency_key,available_at,deadline,release_digest,release_generation)
 SELECT t,s,r,id,'fetch','queued',p.input_ref,expected,key,clock_timestamp(),p.deadline,release,generation FROM control.release_state WHERE digest=release ORDER BY generation DESC LIMIT 1;
 INSERT INTO aios.http_bootstrap_job VALUES(t,s,r,id,parent,(d->>'scopeEvidenceId')::uuid,p.input_ref,d);
 INSERT INTO aios.job_release WITH RECURSIVE deps(digest) AS (SELECT release UNION SELECT x.dependency FROM control.release_dependency x JOIN deps ON x.digest=deps.digest) SELECT t,id,deps.digest,z.generation FROM deps JOIN LATERAL(SELECT generation FROM control.release_state WHERE digest=deps.digest ORDER BY generation DESC LIMIT 1)z ON true;
 RETURN id;
END $$;
REVOKE ALL ON FUNCTION control.enqueue_http_bootstrap(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,text,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.enqueue_http_bootstrap(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,text,jsonb,text,uuid) TO aios_scheduler;
CREATE FUNCTION aios.guard_http_bootstrap_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable_http_descriptor'; END IF;
 IF TG_TABLE_NAME='http_bootstrap_job' THEN RAISE EXCEPTION 'immutable_http_descriptor'; END IF;
 IF TG_OP='UPDATE' AND (OLD.kind='fetch' OR NEW.kind='fetch') AND (OLD.kind,OLD.tenant_id,OLD.site_id,OLD.crawl_id,OLD.job_id,OLD.input_ref,OLD.expected_input_hash,OLD.release_digest,OLD.release_generation,OLD.idempotency_key) IS DISTINCT FROM (NEW.kind,NEW.tenant_id,NEW.site_id,NEW.crawl_id,NEW.job_id,NEW.input_ref,NEW.expected_input_hash,NEW.release_digest,NEW.release_generation,NEW.idempotency_key) THEN RAISE EXCEPTION 'immutable_http_descriptor'; END IF;
 IF NEW.kind='fetch' AND (NEW.state='completed' OR NEW.result_ref IS NOT NULL) THEN RAISE EXCEPTION 'handler_not_installed'; END IF;
 IF NEW.kind='fetch' AND NOT EXISTS(SELECT 1 FROM aios.http_bootstrap_job WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'http_descriptor_required'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION aios.guard_http_bootstrap_job() FROM PUBLIC;
CREATE TRIGGER immutable_http_bootstrap_job BEFORE UPDATE OR DELETE ON http_bootstrap_job FOR EACH ROW EXECUTE FUNCTION aios.guard_http_bootstrap_job();
CREATE CONSTRAINT TRIGGER http_job_descriptor AFTER INSERT OR UPDATE ON job DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION aios.guard_http_bootstrap_job();
-- The existing accounting functions retain their invariants behind these
-- wrappers; renamed implementations are inaccessible to service credentials.
CREATE FUNCTION control.assert_http_bootstrap_context(t uuid,s uuid,r uuid,j uuid,a integer,wanted_origin text,bytes bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE x aios.job;d jsonb;
BEGIN
 SELECT * INTO x FROM aios.job WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j;
 IF x.kind IS DISTINCT FROM 'fetch' THEN RETURN; END IF;
 PERFORM control.assert_http_bootstrap_release(x.release_digest);
 SELECT descriptor INTO d FROM aios.http_bootstrap_job WHERE tenant_id=t AND job_id=j;
 IF d IS NULL OR d->>'origin' IS DISTINCT FROM wanted_origin OR bytes<>512000 OR d->>'maxDecodedBytes' IS DISTINCT FROM bytes::text OR d->>'bundleId' IS DISTINCT FROM x.input_ref::text OR NOT EXISTS(SELECT 1 FROM aios.tenant z WHERE z.id=t AND z.policy_profile_id='local-synthetic-v1') OR NOT EXISTS(SELECT 1 FROM aios.crawl z WHERE z.tenant_id=t AND z.id=r AND z.policy_version='discovery-v1') THEN RAISE EXCEPTION 'scope_denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.site_scope_acceptance z JOIN aios.evidence e ON e.tenant_id=z.tenant_id AND e.id=z.evidence_id JOIN aios.observation o ON o.tenant_id=z.tenant_id AND o.id=z.observation_id JOIN aios.site q ON q.tenant_id=z.tenant_id AND q.id=z.site_id WHERE z.tenant_id=t AND z.site_id=s AND z.crawl_id=r AND z.evidence_id=(d->>'scopeEvidenceId')::uuid AND z.observation_id=(d->>'scopeObservationId')::uuid AND e.sha256=d->>'scopeSha256' AND e.deleted_at IS NULL AND e.state='available' AND e.expires_at>clock_timestamp() AND o.deleted_at IS NULL AND o.state='observed' AND o.fresh_until>clock_timestamp() AND q.deleted_at IS NULL AND q.normalized_origin=wanted_origin) THEN RAISE EXCEPTION 'scope_receipt_required'; END IF;
 IF EXISTS(SELECT 1 FROM aios.http_reservation WHERE tenant_id=t AND job_id=j AND attempt_no<>a) THEN RAISE EXCEPTION 'budget_exhausted'; END IF;
END $$;
REVOKE ALL ON FUNCTION control.assert_http_bootstrap_context(uuid,uuid,uuid,uuid,integer,text,bigint) FROM PUBLIC;
ALTER FUNCTION control.reserve_http_accounting(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,bigint,uuid,text) RENAME TO reserve_http_accounting_internal;
REVOKE ALL ON FUNCTION control.reserve_http_accounting_internal(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,bigint,uuid,text) FROM PUBLIC,aios_scheduler,aios_http_supervisor;
CREATE FUNCTION control.reserve_http_accounting(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,wanted_origin text,bytes bigint,rid uuid,receipt_hash text)
RETURNS SETOF aios.http_reservation LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 PERFORM control.assert_http_bootstrap_context(t,s,r,j,a,wanted_origin,bytes);
 RETURN QUERY SELECT * FROM control.reserve_http_accounting_internal(t,s,r,j,a,aid,tok,wanted_origin,bytes,rid,receipt_hash);
END $$;
REVOKE ALL ON FUNCTION control.reserve_http_accounting(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,bigint,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.reserve_http_accounting(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,bigint,uuid,text) TO aios_scheduler;
ALTER FUNCTION control.bind_http_invocation(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz) RENAME TO bind_http_invocation_internal;
REVOKE ALL ON FUNCTION control.bind_http_invocation_internal(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz) FROM PUBLIC,aios_scheduler,aios_http_supervisor;
CREATE FUNCTION control.bind_http_invocation(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,rid uuid,iid uuid,pid uuid,build text,ctx text,started timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h aios.http_reservation;
BEGIN
 IF session_user<>'aios_http_supervisor' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 SELECT * INTO h FROM aios.http_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND attempt_no=a AND reservation_id=rid AND invocation_id=iid;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 PERFORM control.assert_http_bootstrap_context(t,s,r,j,a,h.origin,h.reserved_bytes);
 IF EXISTS(SELECT 1 FROM aios.job WHERE tenant_id=t AND job_id=j AND kind='fetch') AND NOT EXISTS(SELECT 1 FROM aios.job x JOIN aios.job_attempt y ON y.tenant_id=x.tenant_id AND y.job_id=x.job_id AND y.attempt_no=x.attempt WHERE x.tenant_id=t AND x.job_id=j AND x.state='leased' AND x.lease_token=tok AND x.attempt=a AND y.attempt_id=aid AND x.lease_until>clock_timestamp() AND x.deadline>clock_timestamp() AND h.settled_at IS NULL) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 PERFORM control.bind_http_invocation_internal(t,s,r,j,a,aid,tok,rid,iid,pid,build,ctx,started);
END $$;
REVOKE ALL ON FUNCTION control.bind_http_invocation(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.bind_http_invocation(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz) TO aios_http_supervisor;
