SET search_path=aios,pg_catalog;
CREATE TABLE offline_render_job (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,job_id uuid NOT NULL,
 parent_job_id uuid NOT NULL,page_snapshot_id uuid NOT NULL,bundle_id uuid NOT NULL,
 descriptor jsonb NOT NULL CHECK(jsonb_typeof(descriptor)='object' AND octet_length(descriptor::text)<=16384),
 PRIMARY KEY(tenant_id,job_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES job(tenant_id,job_id),
 FOREIGN KEY(tenant_id,parent_job_id) REFERENCES job(tenant_id,job_id),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,page_snapshot_id) REFERENCES page_snapshot(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,bundle_id) REFERENCES evidence_bundle(tenant_id,id)
);
ALTER TABLE offline_render_job ENABLE ROW LEVEL SECURITY;ALTER TABLE offline_render_job FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON offline_render_job USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
REVOKE ALL ON offline_render_job FROM PUBLIC,aios_runtime,aios_scheduler,aios_render_supervisor;
GRANT SELECT ON offline_render_job TO aios_scheduler;
CREATE FUNCTION control.assert_offline_render_release(d text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m jsonb;
BEGIN
 SELECT manifest INTO m FROM control.release WHERE digest=d AND profile='local-synthetic-v1';
 IF m IS NULL OR m->>'output_schema' IS DISTINCT FROM 'https://schemas.aios-seo.invalid/v1/offline-render-execution.schema.json' OR m->>'external_authority' IS DISTINCT FROM 'read_only' OR jsonb_array_length(m->'procedure')<>1 OR m->'procedure'->0->>'operation' IS DISTINCT FROM 'offline_render_v1' OR m->'procedure'->0->>'executor' IS DISTINCT FROM 'deterministic' OR m->'procedure'->0->>'tool_id' IS DISTINCT FROM 'render.observe' OR m->'procedure'->0->'input_kinds' IS DISTINCT FROM '["raw_html"]'::jsonb OR m->'procedure'->0->>'output_kind' IS DISTINCT FROM 'offline_render_receipt' OR m->'procedure'->0->>'on_failure' IS DISTINCT FROM 'abstain' OR jsonb_array_length(m->'tool_permissions')<>1 OR NOT m->'tool_permissions' @> '[{"tool_id":"render.observe","version":"1.0.0","max_calls":1}]'::jsonb OR NOT m->'policy_constraints' @> '["local-synthetic-v1","discovery-v1"]'::jsonb THEN RAISE EXCEPTION 'handler_not_installed'; END IF;
END $$;
REVOKE ALL ON FUNCTION control.assert_offline_render_release(text) FROM PUBLIC;
CREATE FUNCTION control.enqueue_offline_render(t uuid,s uuid,r uuid,parent uuid,a integer,aid uuid,tok uuid,release text,key text,d jsonb,expected text,id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p aios.job;prior aios.job;dep record;
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,parent);
 SELECT * INTO p FROM aios.job WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=parent AND kind='project' AND state='leased' AND attempt=a AND lease_token=tok AND lease_until>clock_timestamp() AND deadline>clock_timestamp();
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM aios.job_attempt WHERE tenant_id=t AND job_id=parent AND attempt_no=a AND attempt_id=aid) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.tenant z WHERE z.id=t AND z.policy_profile_id='local-synthetic-v1') THEN RAISE EXCEPTION 'policy_blocked'; END IF;
 PERFORM control.assert_offline_render_release(release);
 IF expected IS NULL OR expected !~ '^[a-f0-9]{64}$' OR key IS NULL OR length(key) NOT BETWEEN 1 AND 4096 OR d->>'version' IS DISTINCT FROM '1' OR d->>'handler' IS DISTINCT FROM 'offline_render_v1' OR d->>'policy' IS DISTINCT FROM 'discovery-v1' OR d->>'profile' IS DISTINCT FROM 'local-offline-replay-v3' OR d->>'parentJobId' IS DISTINCT FROM parent::text OR d->>'parentAttemptId' IS DISTINCT FROM aid::text OR d->>'parentAttempt' IS DISTINCT FROM a::text OR d->>'tenantId' IS DISTINCT FROM t::text OR d->>'siteId' IS DISTINCT FROM s::text OR d->>'crawlId' IS DISTINCT FROM r::text OR d->>'bundleId' IS DISTINCT FROM p.input_ref::text OR coalesce(d->>'inputSha256','') !~ '^[a-f0-9]{64}$' OR coalesce(d->>'sourceContextHash','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_input'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.page_snapshot z WHERE z.tenant_id=t AND z.site_id=s AND z.crawl_id=r AND z.id=(d->>'pageSnapshotId')::uuid AND deleted_at IS NULL AND state='captured' AND NOT truncated) THEN RAISE EXCEPTION 'snapshot_unavailable'; END IF;
 FOR dep IN WITH RECURSIVE deps(digest) AS (SELECT release UNION SELECT x.dependency FROM control.release_dependency x JOIN deps ON x.digest=deps.digest)
 SELECT x.digest,z.generation,z.status,x.fresh_until,k.active FROM deps JOIN control.release x ON x.digest=deps.digest LEFT JOIN control.authority_key k ON k.reviewer=(x.approval->>'reviewer')::uuid LEFT JOIN LATERAL(SELECT generation,status FROM control.release_state WHERE digest=x.digest ORDER BY generation DESC LIMIT 1)z ON true LOOP
  IF dep.status IS DISTINCT FROM 'approved' OR dep.active IS DISTINCT FROM true OR dep.fresh_until<=clock_timestamp() THEN RAISE EXCEPTION 'skill_revoked'; END IF;
 END LOOP;
 SELECT * INTO prior FROM aios.job WHERE tenant_id=t AND crawl_id=r AND idempotency_key=key;
 IF FOUND THEN IF prior.expected_input_hash IS DISTINCT FROM expected THEN RAISE EXCEPTION 'conflict';END IF; RETURN prior.job_id;END IF;
 INSERT INTO aios.job(tenant_id,site_id,crawl_id,job_id,kind,state,input_ref,expected_input_hash,idempotency_key,available_at,deadline,release_digest,release_generation)
 SELECT t,s,r,id,'render','queued',p.input_ref,expected,key,clock_timestamp(),p.deadline,release,generation FROM control.release_state WHERE digest=release ORDER BY generation DESC LIMIT 1;
 INSERT INTO aios.offline_render_job VALUES(t,s,r,id,parent,(d->>'pageSnapshotId')::uuid,p.input_ref,d);
 INSERT INTO aios.job_release WITH RECURSIVE deps(digest) AS (SELECT release UNION SELECT x.dependency FROM control.release_dependency x JOIN deps ON x.digest=deps.digest) SELECT t,id,deps.digest,z.generation FROM deps JOIN LATERAL(SELECT generation FROM control.release_state WHERE digest=deps.digest ORDER BY generation DESC LIMIT 1)z ON true;
 RETURN id;
END $$;
REVOKE ALL ON FUNCTION control.enqueue_offline_render(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,text,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.enqueue_offline_render(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,text,jsonb,text,uuid) TO aios_scheduler;
CREATE FUNCTION aios.guard_offline_render_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable_render_descriptor'; END IF;
 IF TG_TABLE_NAME='offline_render_job' THEN RAISE EXCEPTION 'immutable_render_descriptor'; END IF;
 IF TG_OP='UPDATE' AND (OLD.kind='render' OR NEW.kind='render') AND (OLD.kind,OLD.tenant_id,OLD.site_id,OLD.crawl_id,OLD.job_id,OLD.input_ref,OLD.expected_input_hash,OLD.release_digest,OLD.release_generation,OLD.idempotency_key) IS DISTINCT FROM (NEW.kind,NEW.tenant_id,NEW.site_id,NEW.crawl_id,NEW.job_id,NEW.input_ref,NEW.expected_input_hash,NEW.release_digest,NEW.release_generation,NEW.idempotency_key) THEN RAISE EXCEPTION 'immutable_render_descriptor'; END IF;
 IF NEW.kind='render' AND (NEW.state='completed' OR NEW.result_ref IS NOT NULL) THEN RAISE EXCEPTION 'handler_not_installed'; END IF;
 IF NEW.kind='render' AND NOT EXISTS(SELECT 1 FROM aios.offline_render_job WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'render_descriptor_required'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION aios.guard_offline_render_job() FROM PUBLIC;
CREATE TRIGGER immutable_offline_render_job BEFORE UPDATE OR DELETE ON offline_render_job FOR EACH ROW EXECUTE FUNCTION aios.guard_offline_render_job();
CREATE CONSTRAINT TRIGGER render_job_descriptor AFTER INSERT OR UPDATE ON job DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION aios.guard_offline_render_job();
CREATE FUNCTION control.assert_render_job_context(t uuid,j uuid,snapshot uuid,bundle uuid,input_hash text,profile_name text,ctx text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE x aios.job;d jsonb;
BEGIN
 SELECT * INTO x FROM aios.job WHERE tenant_id=t AND job_id=j;
 IF x.kind='project' THEN RETURN true; END IF;
 IF x.kind IS DISTINCT FROM 'render' THEN RETURN false; END IF;
 PERFORM control.assert_offline_render_release(x.release_digest);
 SELECT descriptor INTO d FROM aios.offline_render_job WHERE tenant_id=t AND job_id=j;
 RETURN d IS NOT NULL AND d->>'pageSnapshotId'=snapshot::text AND d->>'bundleId'=bundle::text AND d->>'inputSha256'=input_hash AND d->>'profile'=profile_name AND d->>'sourceContextHash'=ctx;
END $$;
REVOKE ALL ON FUNCTION control.assert_render_job_context(uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION control.reserve_render_accounting(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,snapshot uuid,bundle uuid,input_hash text,profile_name text,ctx text,rid uuid)
RETURNS SETOF aios.render_reservation LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior aios.render_reservation; current_run aios.crawl; totals record; pages record; requests record; page_cap bigint; request_cap bigint; page_charge uuid; request_charge uuid;
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 IF NOT EXISTS(SELECT 1 FROM aios.tenant z JOIN aios.crawl x ON x.tenant_id=z.id WHERE z.id=t AND z.policy_profile_id='local-synthetic-v1' AND x.id=r AND x.site_id=s AND x.policy_version='discovery-v1') THEN RAISE EXCEPTION 'policy_blocked'; END IF;
 IF input_hash IS NULL OR input_hash !~ '^[a-f0-9]{64}$' OR profile_name IS DISTINCT FROM 'local-offline-replay-v3' OR ctx IS NULL OR ctx !~ '^[a-f0-9]{64}$' OR rid IS NULL THEN RAISE EXCEPTION 'invalid_input'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.job x JOIN aios.job_attempt y ON y.tenant_id=x.tenant_id AND y.job_id=x.job_id AND y.attempt_no=x.attempt WHERE x.tenant_id=t AND x.site_id=s AND x.crawl_id=r AND x.job_id=j AND control.assert_render_job_context(t,j,snapshot,bundle,$10,profile_name,ctx) AND x.input_ref=bundle AND x.state='leased' AND x.lease_token=tok AND x.attempt=a AND y.attempt_id=aid AND x.lease_until>clock_timestamp() AND x.deadline>clock_timestamp()) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.page_snapshot p JOIN aios.evidence_bundle b ON b.tenant_id=p.tenant_id AND b.site_id=p.site_id AND b.id=bundle
 WHERE p.tenant_id=t AND p.site_id=s AND p.crawl_id=r AND p.id=snapshot AND p.deleted_at IS NULL AND b.deleted_at IS NULL AND b.state='frozen' AND p.state='captured' AND NOT p.truncated AND p.knowledge_seq<=b.known_seq AND (p.superseded_seq IS NULL OR p.superseded_seq>b.known_seq)
 AND EXISTS(SELECT 1 FROM aios.record_link WHERE tenant_id=t AND owner_id=bundle AND field_name='evidence_ids' AND target_id=p.evidence_id)
 AND EXISTS(SELECT 1 FROM aios.record_link WHERE tenant_id=t AND owner_id=bundle AND field_name='observation_ids' AND target_id=p.observation_id)) THEN RAISE EXCEPTION 'snapshot_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM aios.job x WHERE x.tenant_id=t AND x.job_id=j AND x.kind='render') AND EXISTS(SELECT 1 FROM aios.render_reservation z WHERE z.tenant_id=t AND z.job_id=j AND z.attempt_no<>a) THEN RAISE EXCEPTION 'budget_exhausted'; END IF;
 SELECT * INTO prior FROM aios.render_reservation WHERE tenant_id=t AND job_id=j AND attempt_no=a;
 IF FOUND THEN
  IF (prior.site_id,prior.crawl_id,prior.attempt_id,prior.lease_token,prior.page_snapshot_id,prior.bundle_id,prior.input_sha256,prior.profile,prior.source_context_hash) IS DISTINCT FROM (s,r,aid,tok,snapshot,bundle,input_hash,profile_name,ctx) THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN NEXT prior;RETURN;
 END IF;
 SELECT * INTO current_run FROM aios.crawl WHERE tenant_id=t AND id=r;
 SELECT count(*) AS pages,coalesce(sum(reserved_requests),0) AS requests,coalesce(sum(reserved_bytes),0) AS bytes INTO totals FROM aios.render_reservation WHERE tenant_id=t AND crawl_id=r;
 SELECT coalesce(sum(CASE WHEN state='settled' THEN actual ELSE amount END),0) AS tenant,coalesce(sum(CASE WHEN state='settled' THEN actual ELSE amount END) FILTER(WHERE crawl_id=r),0) AS run INTO pages FROM aios.budget_reservation WHERE tenant_id=t AND kind='render_pages';
 SELECT coalesce(sum(CASE WHEN state='settled' THEN actual ELSE amount END),0) AS tenant,coalesce(sum(CASE WHEN state='settled' THEN actual ELSE amount END) FILTER(WHERE crawl_id=r),0) AS run INTO requests FROM aios.budget_reservation WHERE tenant_id=t AND kind='render_requests';
 SELECT amount INTO page_cap FROM control.tenant_cap WHERE tenant_id=t AND kind='render_pages';SELECT amount INTO request_cap FROM control.tenant_cap WHERE tenant_id=t AND kind='render_requests';
 IF totals.pages>=20 OR totals.requests+100>2000 OR totals.bytes+10485760>209715200 OR page_cap IS NULL OR request_cap IS NULL OR pages.run+1>least(20,(current_run.budget->>'render_pages')::bigint) OR requests.run+100>least(2000,(current_run.budget->>'render_requests')::bigint) OR pages.tenant+1>page_cap OR requests.tenant+100>request_cap THEN RAISE EXCEPTION 'budget_exhausted'; END IF;
 IF EXISTS(SELECT 1 FROM aios.render_reservation WHERE tenant_id=t AND crawl_id=r AND settled_at IS NULL) THEN RAISE EXCEPTION 'render_limited'; END IF;
 UPDATE control.render_concurrency SET in_flight=in_flight+1 WHERE singleton AND in_flight<2;
 IF NOT FOUND THEN RAISE EXCEPTION 'render_limited'; END IF;
 page_charge:=gen_random_uuid();request_charge:=gen_random_uuid();
 INSERT INTO aios.budget_reservation VALUES(t,r,j,a,page_charge,'render_pages',1,1,'settled',encode(sha256(convert_to('{"actual":1,"id":"'||page_charge::text||'"}','UTF8')),'hex')),
 (t,r,j,a,request_charge,'render_requests',100,100,'settled',encode(sha256(convert_to('{"actual":100,"id":"'||request_charge::text||'"}','UTF8')),'hex'));
 RETURN QUERY INSERT INTO aios.render_reservation(tenant_id,site_id,crawl_id,job_id,attempt_no,attempt_id,lease_token,reservation_id,page_snapshot_id,bundle_id,input_sha256,profile,source_context_hash,page_charge_id,request_charge_id)
 VALUES(t,s,r,j,a,aid,tok,rid,snapshot,bundle,input_hash,profile_name,ctx,page_charge,request_charge) RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION control.bind_render_invocation(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,rid uuid,iid uuid,pid uuid,container text,image text,ctx text,started timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h aios.render_reservation; prior aios.render_invocation;
BEGIN
 IF session_user<>'aios_render_supervisor' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 IF NOT EXISTS(SELECT 1 FROM aios.tenant z JOIN aios.crawl x ON x.tenant_id=z.id WHERE z.id=t AND z.policy_profile_id='local-synthetic-v1' AND x.id=r AND x.site_id=s AND x.policy_version='discovery-v1') THEN RAISE EXCEPTION 'policy_blocked'; END IF;
 SELECT * INTO h FROM aios.render_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND reservation_id=rid AND invocation_id=iid;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF pid IS NULL OR container IS NULL OR container !~ '^[a-f0-9]{64}$' OR image IS NULL OR image !~ '^[a-f0-9]{64}$' OR ctx IS DISTINCT FROM h.source_context_hash OR started IS NULL OR NOT isfinite(started) OR started<>date_trunc('milliseconds',started) OR started<date_trunc('milliseconds',h.started_at) OR started>clock_timestamp() THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF h.settled_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM aios.job WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND control.assert_render_job_context(t,j,h.page_snapshot_id,h.bundle_id,h.input_sha256,h.profile,h.source_context_hash) AND input_ref=h.bundle_id AND state='leased' AND lease_token=tok AND attempt=a AND lease_until>clock_timestamp() AND deadline>clock_timestamp()) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 SELECT * INTO prior FROM aios.render_invocation WHERE tenant_id=t AND reservation_id=rid;
 IF FOUND THEN
  IF (prior.invocation_id,prior.process_instance_id,prior.container_id,prior.image_digest,prior.context_hash,prior.started_at) IS DISTINCT FROM (iid,pid,container,image,ctx,started) THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN;
 END IF;
 INSERT INTO aios.render_invocation(tenant_id,reservation_id,invocation_id,process_instance_id,container_id,image_digest,context_hash,started_at) VALUES(t,rid,iid,pid,container,image,ctx,started);
END $$;
