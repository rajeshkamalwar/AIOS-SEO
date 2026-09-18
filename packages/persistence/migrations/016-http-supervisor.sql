SET search_path=aios,pg_catalog;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aios_http_supervisor') THEN
  CREATE ROLE aios_http_supervisor NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
 END IF;
END $$;
GRANT USAGE ON SCHEMA aios,control TO aios_http_supervisor;
-- Existing reservations keep NULL: a new UUID cannot retroactively identify an
-- unknown pre-upgrade process. Only new atomic reservations get an invocation.
ALTER TABLE http_reservation ADD COLUMN invocation_id uuid;
ALTER TABLE http_reservation ALTER COLUMN invocation_id SET DEFAULT gen_random_uuid();
ALTER TABLE http_reservation ADD CONSTRAINT http_invocation_unique UNIQUE(tenant_id,invocation_id);
-- Unknown measured bytes remain unknown after proven termination; reservations stay charged.
DO $$ DECLARE name text; BEGIN
 SELECT conname INTO STRICT name FROM pg_constraint WHERE conrelid='aios.http_reservation'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%actual_bytes IS NULL%';
 EXECUTE format('ALTER TABLE aios.http_reservation DROP CONSTRAINT %I',name);
END $$;
ALTER TABLE http_reservation ADD CHECK(actual_bytes IS NULL OR settled_at IS NOT NULL);
CREATE TABLE http_invocation (
 tenant_id uuid NOT NULL, reservation_id uuid NOT NULL, invocation_id uuid NOT NULL,
 process_instance_id uuid NOT NULL UNIQUE, collector_build_digest text NOT NULL CHECK(collector_build_digest ~ '^[a-f0-9]{64}$'),
 input_context_hash text NOT NULL CHECK(input_context_hash ~ '^[a-f0-9]{64}$'),
 started_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,reservation_id), UNIQUE(tenant_id,invocation_id),
 FOREIGN KEY(tenant_id,reservation_id) REFERENCES http_reservation(tenant_id,reservation_id),
 FOREIGN KEY(tenant_id,invocation_id) REFERENCES http_reservation(tenant_id,invocation_id)
);
CREATE TABLE http_terminal_receipt (
 tenant_id uuid NOT NULL, reservation_id uuid NOT NULL, invocation_id uuid NOT NULL,
 receipt_id uuid NOT NULL DEFAULT gen_random_uuid(), process_instance_id uuid NOT NULL,
 collector_build_digest text NOT NULL,input_context_hash text NOT NULL,
 started_at timestamptz NOT NULL, finished_at timestamptz NOT NULL,
 termination text NOT NULL CHECK(termination IN ('exited','killed')),
 result_digest text NOT NULL CHECK(result_digest ~ '^[a-f0-9]{64}$'),
 actual_decoded_bytes bigint CHECK(actual_decoded_bytes>=0),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,receipt_id), UNIQUE(tenant_id,reservation_id),
 FOREIGN KEY(tenant_id,reservation_id) REFERENCES http_invocation(tenant_id,reservation_id),
 CHECK(finished_at>=started_at)
);
ALTER TABLE http_invocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE http_invocation FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON http_invocation USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
ALTER TABLE http_terminal_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE http_terminal_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON http_terminal_receipt USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
REVOKE ALL ON http_invocation,http_terminal_receipt FROM PUBLIC,aios_runtime,aios_scheduler,aios_operator,aios_evaluator,aios_http_supervisor;
GRANT SELECT ON http_invocation,http_terminal_receipt TO aios_scheduler;
REVOKE INSERT,UPDATE,DELETE ON http_reservation,control.http_origin FROM aios_scheduler;

-- Both scheduler reservations and supervisor pre-bindings honor persisted gates.
-- This checks no external deletion ledger and grants no network dispatch authority.
CREATE FUNCTION control.assert_http_admission(t uuid,s uuid,r uuid,j uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(68273432);
 PERFORM pg_advisory_xact_lock(68273433);
 SELECT submitted_by INTO actor FROM aios.crawl WHERE tenant_id=t AND site_id=s AND id=r AND state='running' AND (budget->>'deadline')::timestamptz>clock_timestamp();
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM aios.work_fence f JOIN aios.tenant z ON z.id=f.tenant_id WHERE f.tenant_id=t AND f.crawl_id=r AND NOT f.quarantined AND f.deletion_epoch=z.deletion_epoch) THEN RAISE EXCEPTION 'run_fenced'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true),set_config('app.user_id',actor::text,true);
 PERFORM aios.authorize('write',s);
 IF NOT EXISTS(SELECT 1 FROM control.health WHERE singleton AND restore_ready AND verified_until>clock_timestamp() AND policy_version='discovery-v1') THEN RAISE EXCEPTION 'policy_unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.job x JOIN aios.job_release d ON d.tenant_id=x.tenant_id AND d.job_id=x.job_id AND d.digest=x.release_digest WHERE x.tenant_id=t AND x.site_id=s AND x.crawl_id=r AND x.job_id=j) THEN RAISE EXCEPTION 'skill_unapproved'; END IF;
 IF EXISTS(SELECT 1 FROM aios.job_release d LEFT JOIN LATERAL (SELECT status FROM control.release_state WHERE digest=d.digest ORDER BY generation DESC LIMIT 1) z ON true WHERE d.tenant_id=t AND d.job_id=j AND (z.status IS NULL OR z.status NOT IN ('approved','deprecated'))) THEN RAISE EXCEPTION 'skill_revoked'; END IF;
 IF EXISTS(SELECT 1 FROM aios.job_release d LEFT JOIN control.release rel ON rel.digest=d.digest LEFT JOIN control.authority_key k ON k.reviewer=(rel.approval->>'reviewer')::uuid WHERE d.tenant_id=t AND d.job_id=j AND (rel.digest IS NULL OR rel.fresh_until<=clock_timestamp() OR k.active IS DISTINCT FROM true OR rel.approval->>'scope' IS DISTINCT FROM 'local-synthetic-v1')) THEN RAISE EXCEPTION 'skill_stale'; END IF;
END $$;
REVOKE ALL ON FUNCTION control.assert_http_admission(uuid,uuid,uuid,uuid) FROM PUBLIC;
CREATE FUNCTION control.reserve_http_accounting(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,wanted_origin text,bytes bigint,rid uuid,receipt_hash text)
RETURNS SETOF aios.http_reservation LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_run aios.crawl; target_site aios.site; prior aios.http_reservation; totals record; charged record; cap bigint; lane text;
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 IF bytes IS NULL OR bytes<1 OR bytes>5242880 OR rid IS NULL OR receipt_hash IS NULL OR receipt_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_input'; END IF;
 SELECT * INTO current_run FROM aios.crawl WHERE tenant_id=t AND site_id=s AND id=r;
 IF NOT FOUND OR current_run.state<>'running' OR (current_run.budget->>'deadline')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'run_fenced'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.work_fence f JOIN aios.tenant z ON z.id=f.tenant_id WHERE f.tenant_id=t AND f.crawl_id=r AND NOT f.quarantined AND f.deletion_epoch=z.deletion_epoch) THEN RAISE EXCEPTION 'run_fenced'; END IF;
 IF NOT EXISTS(SELECT 1 FROM aios.job x JOIN aios.job_attempt y ON y.tenant_id=x.tenant_id AND y.job_id=x.job_id AND y.attempt_no=x.attempt WHERE x.tenant_id=t AND x.job_id=j AND x.site_id=s AND x.crawl_id=r AND x.attempt=a AND x.lease_token=tok AND y.attempt_id=aid AND x.state='leased' AND x.lease_until>clock_timestamp() AND x.deadline>clock_timestamp()) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 SELECT * INTO target_site FROM aios.site WHERE tenant_id=t AND id=s;
 IF NOT FOUND OR wanted_origin IS DISTINCT FROM target_site.normalized_origin THEN RAISE EXCEPTION 'scope_denied'; END IF;
 SELECT * INTO prior FROM aios.http_reservation WHERE tenant_id=t AND job_id=j AND attempt_no=a;
 IF FOUND THEN
  IF prior.invocation_id IS NULL THEN RAISE EXCEPTION 'legacy_invocation_unverified'; END IF;
  IF (prior.site_id,prior.crawl_id,prior.attempt_id,prior.lease_token,prior.origin,prior.reserved_bytes) IS DISTINCT FROM (s,r,aid,tok,wanted_origin,bytes) THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN NEXT prior; RETURN;
 END IF;
 SELECT count(*) AS attempts,coalesce(sum(reserved_bytes),0) AS bytes INTO totals FROM aios.http_reservation WHERE tenant_id=t AND crawl_id=r;
 SELECT coalesce(sum(CASE WHEN state='settled' THEN actual ELSE amount END),0) AS tenant,
 coalesce(sum(CASE WHEN state='settled' THEN actual ELSE amount END) FILTER(WHERE crawl_id=r),0) AS run INTO charged FROM aios.budget_reservation WHERE tenant_id=t AND kind='http_requests';
 SELECT amount INTO cap FROM control.tenant_cap WHERE tenant_id=t AND kind='http_requests';
 IF totals.attempts>=750 OR totals.bytes+bytes>262144000 OR cap IS NULL OR charged.run+1>least(750,(current_run.budget->>'http_requests')::bigint) OR charged.tenant+1>cap THEN RAISE EXCEPTION 'budget_exhausted'; END IF;
 lane:='https://'||rtrim(regexp_replace(lower(wanted_origin),'^https?://',''),'.');
 INSERT INTO control.http_origin VALUES(lane,'-infinity',0) ON CONFLICT DO NOTHING;
 UPDATE control.http_origin SET last_started_at=clock_timestamp(),in_flight=in_flight+1 WHERE origin=lane AND in_flight<2 AND last_started_at<=clock_timestamp()-interval '1 second';
 IF NOT FOUND THEN RAISE EXCEPTION 'origin_limited'; END IF;
 INSERT INTO aios.budget_reservation VALUES(t,r,j,a,rid,'http_requests',1,1,'settled',receipt_hash);
 RETURN QUERY INSERT INTO aios.http_reservation(tenant_id,site_id,crawl_id,job_id,attempt_no,attempt_id,lease_token,reservation_id,origin,reserved_bytes) VALUES(t,s,r,j,a,aid,tok,rid,wanted_origin,bytes) RETURNING *;
END $$;
-- Immutable binding is a trusted local supervisor protocol record, never dispatch authority.
CREATE FUNCTION control.bind_http_invocation(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,rid uuid,iid uuid,pid uuid,build text,ctx text,started timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h aios.http_reservation; prior aios.http_invocation;
BEGIN
 IF session_user<>'aios_http_supervisor' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM control.assert_http_admission(t,s,r,j);
 SELECT * INTO h FROM aios.http_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND reservation_id=rid AND invocation_id=iid;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF pid IS NULL OR build IS NULL OR ctx IS NULL OR started IS NULL OR NOT isfinite(started) OR build !~ '^[a-f0-9]{64}$' OR ctx !~ '^[a-f0-9]{64}$' OR started<>date_trunc('milliseconds',started) OR started<date_trunc('milliseconds',h.started_at) OR started>clock_timestamp() THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 SELECT * INTO prior FROM aios.http_invocation WHERE tenant_id=t AND reservation_id=rid;
 IF FOUND THEN
  IF (prior.invocation_id,prior.process_instance_id,prior.collector_build_digest,prior.input_context_hash,prior.started_at) IS DISTINCT FROM (iid,pid,build,ctx,started) THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN;
 END IF;
 IF h.settled_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM aios.job x JOIN aios.crawl y ON y.tenant_id=x.tenant_id AND y.id=x.crawl_id WHERE x.tenant_id=t AND x.job_id=j AND x.site_id=s AND x.crawl_id=r AND x.attempt=a AND x.lease_token=tok AND x.state='leased' AND x.lease_until>clock_timestamp() AND x.deadline>clock_timestamp() AND y.state='running') THEN RAISE EXCEPTION 'lease_lost'; END IF;
 INSERT INTO aios.http_invocation(tenant_id,reservation_id,invocation_id,process_instance_id,collector_build_digest,input_context_hash,started_at) VALUES(t,rid,iid,pid,build,ctx,started);
END $$;
CREATE FUNCTION control.record_http_terminal(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,rid uuid,iid uuid,pid uuid,build text,ctx text,started timestamptz,finished timestamptz,ended text,digest text,actual bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h aios.http_reservation; binding aios.http_invocation; prior aios.http_terminal_receipt; result uuid;
BEGIN
 IF session_user<>'aios_http_supervisor' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM pg_advisory_xact_lock(68273433);
 SELECT * INTO h FROM aios.http_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND reservation_id=rid AND invocation_id=iid;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 SELECT * INTO binding FROM aios.http_invocation WHERE tenant_id=t AND reservation_id=rid;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF (binding.invocation_id,binding.process_instance_id,binding.collector_build_digest,binding.input_context_hash,binding.started_at) IS DISTINCT FROM (iid,pid,build,ctx,started) THEN RAISE EXCEPTION 'conflict'; END IF;
 IF finished IS NULL OR NOT isfinite(finished) OR finished<>date_trunc('milliseconds',finished) OR finished<date_trunc('milliseconds',binding.recorded_at) OR finished<started OR finished>clock_timestamp() OR ended IS NULL OR ended NOT IN ('exited','killed') OR digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR actual<0 OR actual>h.reserved_bytes THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 SELECT * INTO prior FROM aios.http_terminal_receipt WHERE tenant_id=t AND reservation_id=rid;
 IF FOUND THEN
  IF (prior.finished_at,prior.termination,prior.result_digest,prior.actual_decoded_bytes) IS DISTINCT FROM (finished,ended,digest,actual) THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN prior.receipt_id;
 END IF;
 INSERT INTO aios.http_terminal_receipt(tenant_id,reservation_id,invocation_id,process_instance_id,collector_build_digest,input_context_hash,started_at,finished_at,termination,result_digest,actual_decoded_bytes)
 VALUES(t,rid,iid,pid,build,ctx,started,finished,ended,digest,actual) RETURNING receipt_id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION control.settle_http_terminal(t uuid,s uuid,r uuid,j uuid,a integer,aid uuid,tok uuid,rid uuid,receipt uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h aios.http_reservation; terminal aios.http_terminal_receipt; lane text;
BEGIN
 IF session_user<>'aios_scheduler' THEN RAISE EXCEPTION 'service_authority_required'; END IF;
 PERFORM pg_advisory_xact_lock(68273433);
 SELECT * INTO h FROM aios.http_reservation WHERE tenant_id=t AND site_id=s AND crawl_id=r AND job_id=j AND attempt_no=a AND attempt_id=aid AND lease_token=tok AND reservation_id=rid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 SELECT * INTO terminal FROM aios.http_terminal_receipt WHERE tenant_id=t AND reservation_id=rid AND invocation_id=h.invocation_id AND receipt_id=receipt;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 IF h.settled_at IS NOT NULL THEN
  IF h.actual_bytes IS DISTINCT FROM terminal.actual_decoded_bytes THEN RAISE EXCEPTION 'conflict'; END IF;
  RETURN;
 END IF;
 UPDATE aios.http_reservation SET actual_bytes=terminal.actual_decoded_bytes,settled_at=clock_timestamp() WHERE tenant_id=t AND reservation_id=rid;
 lane:='https://'||rtrim(regexp_replace(lower(h.origin),'^https?://',''),'.');
 UPDATE control.http_origin SET in_flight=in_flight-1 WHERE origin=lane AND in_flight>0;
 IF NOT FOUND THEN RAISE EXCEPTION 'accounting_integrity'; END IF;
END $$;
REVOKE ALL ON FUNCTION control.reserve_http_accounting(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,bigint,uuid,text),control.bind_http_invocation(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz),control.record_http_terminal(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,bigint),control.settle_http_terminal(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.reserve_http_accounting(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,bigint,uuid,text),control.settle_http_terminal(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid) TO aios_scheduler;
GRANT EXECUTE ON FUNCTION control.bind_http_invocation(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz),control.record_http_terminal(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,bigint) TO aios_http_supervisor;

-- The generic charge backing an HTTP attempt cannot be refunded independently.
CREATE FUNCTION aios.guard_http_charge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(68273433);
 IF EXISTS(SELECT 1 FROM aios.http_reservation WHERE tenant_id=OLD.tenant_id AND reservation_id=OLD.reservation_id) THEN RAISE EXCEPTION 'immutable_http_charge'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION aios.guard_http_charge() FROM PUBLIC;
CREATE TRIGGER immutable_http_charge BEFORE UPDATE OR DELETE ON budget_reservation FOR EACH ROW EXECUTE FUNCTION aios.guard_http_charge();
