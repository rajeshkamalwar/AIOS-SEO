SET search_path=aios,pg_catalog;
CREATE FUNCTION immutable_snapshot_links() RETURNS trigger LANGUAGE plpgsql SET search_path=aios,pg_catalog AS $$
BEGIN
 -- Neither Page nor PageSnapshot has a governed post-acceptance provenance
 -- enrichment command yet. Their accepted reference sets stay immutable.
 IF EXISTS(SELECT 1 FROM record_index WHERE tenant_id=NEW.tenant_id AND id=NEW.owner_id AND record_type IN ('Page','PageSnapshot') AND created_xid<>pg_current_xact_id()) THEN RAISE EXCEPTION 'immutable_reference_set'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_snapshot_links BEFORE INSERT ON record_link FOR EACH ROW EXECUTE FUNCTION immutable_snapshot_links();
-- Infrastructure projection of already accepted fixture artifacts. No network
-- tool or discovery handler is installed and no table write grant is added.
CREATE FUNCTION control.project_http_fixture(wanted_job uuid, wanted_token uuid, wanted_attempt bigint, wanted_attempt_id uuid, wanted_observation uuid, receipt_text text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=aios,pg_catalog AS $$
DECLARE j job%ROWTYPE; r crawl%ROWTYPE; a http_fixture_acceptance%ROWTYPE;
 o observation%ROWTYPE; b evidence%ROWTYPE; e evidence%ROWTYPE; bundle evidence_bundle%ROWTYPE;
 receipt jsonb; page_key uuid; snapshot_key uuid; seq bigint; at_time timestamptz; support jsonb;
BEGIN
 SELECT * INTO j FROM job WHERE tenant_id=tenant_scope() AND job_id=wanted_job AND kind='project' AND state='leased'
   AND lease_token=wanted_token AND attempt=wanted_attempt AND lease_until>clock_timestamp() AND deadline>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'lease_lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM job_attempt WHERE tenant_id=j.tenant_id AND job_id=j.job_id AND attempt_no=j.attempt AND attempt_id=wanted_attempt_id) THEN RAISE EXCEPTION 'lease_lost'; END IF;
 SELECT * INTO r FROM crawl WHERE tenant_id=j.tenant_id AND site_id=j.site_id AND id=j.crawl_id AND state='running' AND submitted_by=user_scope();
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM work_fence f JOIN tenant t ON t.id=f.tenant_id WHERE f.tenant_id=j.tenant_id AND f.crawl_id=j.crawl_id AND NOT f.quarantined AND f.deletion_epoch=t.deletion_epoch) THEN RAISE EXCEPTION 'run_fenced'; END IF;
 PERFORM authorize('write',j.site_id);
 IF NOT EXISTS(SELECT 1 FROM control.health WHERE singleton AND restore_ready AND verified_until>clock_timestamp() AND policy_version='discovery-v1') THEN RAISE EXCEPTION 'policy_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM job_release d JOIN LATERAL (SELECT status FROM control.release_state WHERE digest=d.digest ORDER BY generation DESC LIMIT 1) s ON true WHERE d.tenant_id=j.tenant_id AND d.job_id=j.job_id AND s.status NOT IN ('approved','deprecated')) THEN RAISE EXCEPTION 'skill_revoked'; END IF;
 IF EXISTS(SELECT 1 FROM job_release d JOIN control.release rel ON rel.digest=d.digest LEFT JOIN control.authority_key k ON k.reviewer=(rel.approval->>'reviewer')::uuid WHERE d.tenant_id=j.tenant_id AND d.job_id=j.job_id AND (rel.fresh_until<=clock_timestamp() OR k.active IS DISTINCT FROM true)) THEN RAISE EXCEPTION 'skill_stale'; END IF;
 SELECT * INTO a FROM http_fixture_acceptance WHERE tenant_id=j.tenant_id AND site_id=j.site_id AND observation_id=wanted_observation;
 IF NOT FOUND OR a.body_evidence_id IS NULL THEN RAISE EXCEPTION 'snapshot_unavailable'; END IF;
 SELECT * INTO o FROM observation WHERE tenant_id=j.tenant_id AND site_id=j.site_id AND id=wanted_observation AND state IN ('observed','partial') AND fresh_until>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'snapshot_unavailable'; END IF;
 SELECT * INTO b FROM evidence WHERE tenant_id=j.tenant_id AND site_id=j.site_id AND id=a.body_evidence_id AND state='available' AND expires_at>clock_timestamp() AND mime_type IN ('text/html','application/xhtml+xml');
 IF NOT FOUND THEN RAISE EXCEPTION 'snapshot_unavailable'; END IF;
 SELECT * INTO e FROM evidence WHERE tenant_id=j.tenant_id AND site_id=j.site_id AND id=a.receipt_evidence_id AND state='available' AND expires_at>clock_timestamp() AND mime_type='application/json';
 IF NOT FOUND OR encode(sha256(convert_to(receipt_text,'UTF8')),'hex')<>e.sha256 OR octet_length(receipt_text)<>e.bytes OR o.context_hash<>e.sha256 OR e.source_uri<>b.source_uri THEN RAISE EXCEPTION 'artifact_integrity_failed'; END IF;
 receipt:=receipt_text::jsonb;
 IF receipt->>'body_evidence_id' IS DISTINCT FROM b.id::text OR receipt->>'method' IS DISTINCT FROM 'GET' OR receipt->>'url' IS DISTINCT FROM b.source_uri OR receipt->>'final_url' IS DISTINCT FROM b.source_uri
   OR receipt->>'status_code' IS NULL OR (receipt->>'status_code')::integer BETWEEN 300 AND 399 THEN RAISE EXCEPTION 'snapshot_unavailable'; END IF;
 SELECT * INTO bundle FROM evidence_bundle WHERE tenant_id=j.tenant_id AND site_id=j.site_id AND id=j.input_ref AND state='frozen';
 IF NOT FOUND OR greatest(o.knowledge_seq,b.knowledge_seq,e.knowledge_seq)>bundle.known_seq
   OR NOT EXISTS(SELECT 1 FROM record_link WHERE tenant_id=j.tenant_id AND owner_id=bundle.id AND field_name='observation_ids' AND target_id=o.id)
   OR (SELECT count(*) FROM record_link WHERE tenant_id=j.tenant_id AND owner_id=bundle.id AND field_name='evidence_ids' AND target_id IN (b.id,e.id))<>2
   OR (SELECT count(*) FROM record_link WHERE tenant_id=j.tenant_id AND owner_id=o.id AND field_name='evidence_ids' AND target_id IN (b.id,e.id))<>2 THEN RAISE EXCEPTION 'bundle_membership_required'; END IF;
 IF EXISTS(SELECT 1 FROM page_snapshot WHERE tenant_id=j.tenant_id AND observation_id=o.id) THEN RAISE EXCEPTION 'snapshot_exists'; END IF;
 UPDATE knowledge_clock SET seq=knowledge_clock.seq+1,recorded_at=greatest(clock_timestamp(),knowledge_clock.recorded_at) WHERE tenant_id=j.tenant_id RETURNING knowledge_clock.seq,knowledge_clock.recorded_at INTO seq,at_time;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_denied'; END IF;
 INSERT INTO knowledge_commit VALUES(j.tenant_id,seq,at_time);
 support:='{"source_applicability":"uncertain","integrity":"verified","coverage":"unknown","identity":"provisional","inference":"unknown","reasons":[]}'::jsonb;
 SELECT id INTO page_key FROM page WHERE tenant_id=j.tenant_id AND site_id=j.site_id AND url_key=b.source_uri;
 IF NOT FOUND THEN
   page_key:=gen_random_uuid();
   INSERT INTO page VALUES('Page',page_key,1,1,at_time,at_time,at_time,NULL,'active','derived',j.tenant_id,j.site_id,b.source_uri,b.source_uri,'unknown',support,seq);
   INSERT INTO record_link VALUES(j.tenant_id,page_key,'provenance_ids',0,o.id,'Observation'),(j.tenant_id,page_key,'provenance_ids',1,e.id,'Evidence'),(j.tenant_id,page_key,'provenance_ids',2,b.id,'Evidence');
 END IF;
 snapshot_key:=gen_random_uuid();
 INSERT INTO page_snapshot VALUES('PageSnapshot',snapshot_key,1,1,at_time,at_time,at_time,NULL,CASE WHEN o.state='partial' THEN 'partial' ELSE 'captured' END,'raw',j.tenant_id,j.site_id,snapshot_key,NULL,NULL,NULL,page_key,j.crawl_id,o.id,b.id,o.observed_at,(receipt->>'status_code')::bigint,b.sha256,NULL,(receipt->>'truncated')::boolean,seq,NULL);
 INSERT INTO record_link VALUES(j.tenant_id,snapshot_key,'provenance_ids',0,o.id,'Observation'),(j.tenant_id,snapshot_key,'provenance_ids',1,e.id,'Evidence'),(j.tenant_id,snapshot_key,'provenance_ids',2,b.id,'Evidence'),(j.tenant_id,snapshot_key,'provenance_ids',3,bundle.id,'EvidenceBundle');
 RETURN snapshot_key;
END $$;
REVOKE ALL ON FUNCTION control.project_http_fixture(uuid,uuid,bigint,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.project_http_fixture(uuid,uuid,bigint,uuid,uuid,text) TO aios_scheduler;
