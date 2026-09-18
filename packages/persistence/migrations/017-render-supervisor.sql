SET search_path=aios,pg_catalog;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aios_render_supervisor') THEN CREATE ROLE aios_render_supervisor NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; END IF;
END $$;
GRANT USAGE ON SCHEMA aios,control TO aios_render_supervisor;
CREATE TABLE control.render_concurrency(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),in_flight integer NOT NULL CHECK(in_flight BETWEEN 0 AND 2));
INSERT INTO control.render_concurrency VALUES(true,0);
CREATE TABLE render_reservation (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,job_id uuid NOT NULL,
 attempt_no integer NOT NULL,attempt_id uuid NOT NULL,lease_token uuid NOT NULL,
 reservation_id uuid NOT NULL,invocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
 page_snapshot_id uuid NOT NULL,bundle_id uuid NOT NULL,input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),
 profile text NOT NULL CHECK(profile='local-offline-replay-v3'),source_context_hash text NOT NULL CHECK(source_context_hash ~ '^[a-f0-9]{64}$'),
 page_charge_id uuid NOT NULL,request_charge_id uuid NOT NULL,
 reserved_pages integer NOT NULL DEFAULT 1 CHECK(reserved_pages=1),reserved_requests integer NOT NULL DEFAULT 100 CHECK(reserved_requests=100),reserved_bytes bigint NOT NULL DEFAULT 10485760 CHECK(reserved_bytes=10485760),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),settled_at timestamptz,
 actual_requests integer CHECK(actual_requests BETWEEN 0 AND 100),actual_bytes bigint CHECK(actual_bytes BETWEEN 0 AND 10485760),
 PRIMARY KEY(tenant_id,reservation_id),UNIQUE(tenant_id,invocation_id),UNIQUE(tenant_id,job_id,attempt_no),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,job_id,attempt_no) REFERENCES job_attempt(tenant_id,job_id,attempt_no),
 FOREIGN KEY(tenant_id,site_id,page_snapshot_id) REFERENCES page_snapshot(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,bundle_id) REFERENCES evidence_bundle(tenant_id,id),
 FOREIGN KEY(tenant_id,page_charge_id) REFERENCES budget_reservation(tenant_id,reservation_id),
 FOREIGN KEY(tenant_id,request_charge_id) REFERENCES budget_reservation(tenant_id,reservation_id),
 CHECK(settled_at IS NOT NULL OR actual_requests IS NULL AND actual_bytes IS NULL)
);
CREATE TABLE render_invocation (
 tenant_id uuid NOT NULL,reservation_id uuid NOT NULL,invocation_id uuid NOT NULL,
 process_instance_id uuid NOT NULL UNIQUE,container_id text NOT NULL UNIQUE CHECK(container_id ~ '^[a-f0-9]{64}$'),
 image_digest text NOT NULL CHECK(image_digest ~ '^[a-f0-9]{64}$'),context_hash text NOT NULL CHECK(context_hash ~ '^[a-f0-9]{64}$'),
 started_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,reservation_id),UNIQUE(tenant_id,invocation_id),
 FOREIGN KEY(tenant_id,reservation_id) REFERENCES render_reservation(tenant_id,reservation_id),
 FOREIGN KEY(tenant_id,invocation_id) REFERENCES render_reservation(tenant_id,invocation_id)
);
CREATE TABLE render_terminal_receipt (
 tenant_id uuid NOT NULL,reservation_id uuid NOT NULL,invocation_id uuid NOT NULL,receipt_id uuid NOT NULL DEFAULT gen_random_uuid(),
 process_instance_id uuid NOT NULL,container_id text NOT NULL,image_digest text NOT NULL,context_hash text NOT NULL,
 started_at timestamptz NOT NULL,finished_at timestamptz NOT NULL,termination text NOT NULL CHECK(termination IN ('exited','killed')),
 result_digest text NOT NULL CHECK(result_digest ~ '^[a-f0-9]{64}$'),actual_requests integer CHECK(actual_requests BETWEEN 0 AND 100),actual_bytes bigint CHECK(actual_bytes BETWEEN 0 AND 10485760),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,receipt_id),UNIQUE(tenant_id,reservation_id),
 FOREIGN KEY(tenant_id,reservation_id) REFERENCES render_invocation(tenant_id,reservation_id),CHECK(finished_at>=started_at)
);
ALTER TABLE render_reservation ENABLE ROW LEVEL SECURITY;ALTER TABLE render_reservation FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON render_reservation USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE render_invocation ENABLE ROW LEVEL SECURITY;ALTER TABLE render_invocation FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON render_invocation USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE render_terminal_receipt ENABLE ROW LEVEL SECURITY;ALTER TABLE render_terminal_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON render_terminal_receipt USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
REVOKE ALL ON render_reservation,render_invocation,render_terminal_receipt,control.render_concurrency FROM PUBLIC,aios_runtime,aios_scheduler,aios_operator,aios_evaluator,aios_http_supervisor,aios_render_supervisor;
GRANT SELECT ON render_reservation,render_invocation,render_terminal_receipt,control.render_concurrency TO aios_scheduler;
-- Reuse the existing persisted member/health/release/run gate. This protocol
-- pins asserted prepared-input metadata; it cannot authenticate decoded bytes.
CREATE FUNCTION control.reserve_render_accounting(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,snapshot uuid,bundle uuid,input_hash text,profile_name text,ctx text,rid uuid)
RETURNS SETOF aios.render_reservation LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior aios.render_reservation; current_run aios.crawl; totals record; pages record; requests record; page_cap bigint; request_cap bigint; page_charge uuid; request_charge uuid;
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 IF NOT EXISTS(SELECT 1 FROM aios.tenant z JOIN aios.crawl x ON x.tenant_id=z.id WHERE z.id=t AND z.policy_profile_id='local-synthetic-v1' AND x.id=r AND x.site_id=s AND x.policy_version='discovery-v1') THEN RAISE EXCEPTION 'policy_blocked'; END IF;
 IF input_hash IS NULL OR input_hash !~ '^[a-f0-9]{64}$' OR profile_name IS DISTINCT FROM 'local-offline-replay-v3' OR ctx IS NULL OR ctx !~ '^[a-f0-9]{64}$' OR rid IS NULL THEN RAISE EXCEPTION 'invalid_input'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.job x JOIN aios.job_attempt y ON y.tenant_id=x.tenant_id AND y.job_id=x.job_id AND y.attempt_no=x.attempt WHERE x.tenant_id=t AND x.site_id=s AND x.crawl_id=r AND x.job_id=j AND x.kind='project' AND x.input_ref=bundle AND x.state='leased' AND x.lease_token=tok AND x.attempt=a AND y.attempt_id=aid AND x.lease_until>clock_timestamp() AND x.deadline>clock_timestamp()) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.page_snapshot p JOIN aios.evidence_bundle b ON b.tenant_id=p.tenant_id AND b.site_id=p.site_id AND b.id=bundle
 WHERE p.tenant_id=t AND p.site_id=s AND p.crawl_id=r AND p.id=snapshot AND p.deleted_at IS NULL AND b.deleted_at IS NULL AND b.state='frozen' AND p.state='captured' AND NOT p.truncated AND p.knowledge_seq<=b.known_seq AND (p.superseded_seq IS NULL OR p.superseded_seq>b.known_seq)
 AND EXISTS(SELECT 1 FROM aios.record_link WHERE tenant_id=t AND owner_id=bundle AND field_name='evidence_ids' AND target_id=p.evidence_id)
 AND EXISTS(SELECT 1 FROM aios.record_link WHERE tenant_id=t AND owner_id=bundle AND field_name='observation_ids' AND target_id=p.observation_id)) THEN RAISE EXCEPTION 'snapshot_unavailable'; END IF;
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
CREATE FUNCTION control.bind_render_invocation(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,rid uuid,iid uuid,pid uuid,container text,image text,ctx text,started timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h aios.render_reservation; prior aios.render_invocation;
BEGIN
 IF session_user<>'aios_render_supervisor' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 IF NOT EXISTS(SELECT 1 FROM aios.tenant z JOIN aios.crawl x ON x.tenant_id=z.id WHERE z.id=t AND z.policy_profile_id='local-synthetic-v1' AND x.id=r AND x.site_id=s AND x.policy_version='discovery-v1') THEN RAISE EXCEPTION 'policy_blocked'; END IF;
 SELECT * INTO h FROM aios.render_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND reservation_id=rid AND invocation_id=iid;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF pid IS NULL OR container IS NULL OR container !~ '^[a-f0-9]{64}$' OR image IS NULL OR image !~ '^[a-f0-9]{64}$' OR ctx IS DISTINCT FROM h.source_context_hash OR started IS NULL OR NOT isfinite(started) OR started<>date_trunc('milliseconds',started) OR started<date_trunc('milliseconds',h.started_at) OR started>clock_timestamp() THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF h.settled_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM aios.job WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND kind='project' AND input_ref=h.bundle_id AND state='leased' AND lease_token=tok AND attempt=a AND lease_until>clock_timestamp() AND deadline>clock_timestamp()) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 SELECT * INTO prior FROM aios.render_invocation WHERE tenant_id=t AND reservation_id=rid;
 IF FOUND THEN
  IF (prior.invocation_id,prior.process_instance_id,prior.container_id,prior.image_digest,prior.context_hash,prior.started_at) IS DISTINCT FROM (iid,pid,container,image,ctx,started) THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN;
 END IF;
 INSERT INTO aios.render_invocation(tenant_id,reservation_id,invocation_id,process_instance_id,container_id,image_digest,context_hash,started_at) VALUES(t,rid,iid,pid,container,image,ctx,started);
END $$;
CREATE FUNCTION control.record_render_terminal(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,rid uuid,iid uuid,pid uuid,container text,image text,ctx text,started timestamptz,finished timestamptz,ended text,digest text,requests integer,bytes bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h aios.render_reservation; binding aios.render_invocation; prior aios.render_terminal_receipt; result uuid;
BEGIN
 IF session_user<>'aios_render_supervisor' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM pg_advisory_xact_lock(68273433);
 SELECT * INTO h FROM aios.render_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND reservation_id=rid AND invocation_id=iid;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 SELECT * INTO binding FROM aios.render_invocation WHERE tenant_id=t AND reservation_id=rid;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF (binding.invocation_id,binding.process_instance_id,binding.container_id,binding.image_digest,binding.context_hash,binding.started_at) IS DISTINCT FROM (iid,pid,container,image,ctx,started) THEN RAISE EXCEPTION 'conflict'; END IF;
 IF finished IS NULL OR NOT isfinite(finished) OR finished<>date_trunc('milliseconds',finished) OR finished<date_trunc('milliseconds',binding.recorded_at) OR finished<started OR finished>clock_timestamp() OR ended IS NULL OR ended NOT IN ('exited','killed') OR digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR requests<0 OR requests>100 OR bytes<0 OR bytes>10485760 THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 SELECT * INTO prior FROM aios.render_terminal_receipt WHERE tenant_id=t AND reservation_id=rid;
 IF FOUND THEN
  IF (prior.finished_at,prior.termination,prior.result_digest,prior.actual_requests,prior.actual_bytes) IS DISTINCT FROM (finished,ended,digest,requests,bytes) THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN prior.receipt_id;
 END IF;
 INSERT INTO aios.render_terminal_receipt(tenant_id,reservation_id,invocation_id,process_instance_id,container_id,image_digest,context_hash,started_at,finished_at,termination,result_digest,actual_requests,actual_bytes)
 VALUES(t,rid,iid,pid,container,image,ctx,started,finished,ended,digest,requests,bytes) RETURNING receipt_id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION control.settle_render_terminal(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,rid uuid,receipt uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h aios.render_reservation; terminal aios.render_terminal_receipt;
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM pg_advisory_xact_lock(68273433);
 SELECT * INTO h FROM aios.render_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND reservation_id=rid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 SELECT * INTO terminal FROM aios.render_terminal_receipt WHERE tenant_id=t AND reservation_id=rid AND invocation_id=h.invocation_id AND receipt_id=receipt;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF h.settled_at IS NOT NULL THEN
  IF (h.actual_requests,h.actual_bytes) IS DISTINCT FROM (terminal.actual_requests,terminal.actual_bytes) THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN;
 END IF;
 UPDATE aios.render_reservation SET actual_requests=terminal.actual_requests,actual_bytes=terminal.actual_bytes,settled_at=clock_timestamp() WHERE tenant_id=t AND reservation_id=rid;
 UPDATE control.render_concurrency SET in_flight=in_flight-1 WHERE singleton AND in_flight>0;
 IF NOT FOUND THEN RAISE EXCEPTION 'accounting_integrity'; END IF;
END $$;
CREATE FUNCTION aios.guard_render_charge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(68273433);
 IF EXISTS(SELECT 1 FROM aios.render_reservation WHERE tenant_id=OLD.tenant_id AND (page_charge_id=OLD.reservation_id OR request_charge_id=OLD.reservation_id)) THEN RAISE EXCEPTION 'immutable_render_charge'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION aios.guard_render_charge() FROM PUBLIC;
CREATE TRIGGER immutable_render_charge BEFORE UPDATE OR DELETE ON budget_reservation FOR EACH ROW EXECUTE FUNCTION aios.guard_render_charge();
REVOKE ALL ON FUNCTION control.reserve_render_accounting(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,text,text,text,uuid),control.bind_render_invocation(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz),control.record_render_terminal(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,integer,bigint),control.settle_render_terminal(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.reserve_render_accounting(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,text,text,text,uuid),control.settle_render_terminal(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid) TO aios_scheduler;
GRANT EXECUTE ON FUNCTION control.bind_render_invocation(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz),control.record_render_terminal(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,integer,bigint) TO aios_render_supervisor;
