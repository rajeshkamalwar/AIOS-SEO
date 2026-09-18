SET search_path=aios,pg_catalog;
CREATE TABLE fixture_link_batch (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,page_snapshot_id uuid NOT NULL,
 robots_observation_id uuid NOT NULL,bundle_id uuid NOT NULL,input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 sources jsonb NOT NULL,result jsonb NOT NULL,recorded_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,crawl_id,page_snapshot_id),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,page_snapshot_id) REFERENCES page_snapshot(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,robots_observation_id) REFERENCES observation(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,bundle_id) REFERENCES evidence_bundle(tenant_id,id)
);
ALTER TABLE fixture_link_batch ENABLE ROW LEVEL SECURITY; ALTER TABLE fixture_link_batch FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON fixture_link_batch USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER immutable_link_batch BEFORE UPDATE OR DELETE ON fixture_link_batch FOR EACH ROW EXECUTE FUNCTION reject_mutation();
GRANT SELECT ON fixture_link_batch TO aios_runtime,aios_scheduler,aios_evaluator,aios_operator;

-- Called only by the trusted fixture coordinator after exact artifact and locator validation.
-- This grants durable target classification, never a fetch job or external tool.
CREATE FUNCTION control.discover_fixture_links(wanted_run uuid,wanted_bundle uuid,wanted_snapshot uuid,robots_obs uuid,digest text,candidates jsonb,exclusions jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=aios,pg_catalog AS $$
DECLARE r crawl%ROWTYPE;s site%ROWTYPE;b evidence_bundle%ROWTYPE;scope_receipt site_scope_acceptance%ROWTYPE;
 snapshot page_snapshot%ROWTYPE;parent crawl_target%ROWTYPE;prior fixture_link_batch%ROWTYPE;item jsonb;target uuid;current_count integer;variant_count integer;inserted integer:=0;overflow integer:=0;
 seq bigint;at_time timestamptz;why text;path text;slots integer;result jsonb;
BEGIN
 SELECT * INTO r FROM crawl WHERE tenant_id=tenant_scope() AND id=wanted_run AND submitted_by=user_scope() AND state IN ('queued','running') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_denied'; END IF;
 PERFORM authorize('write',r.site_id);
 IF r.policy_version<>'discovery-v1' OR (r.budget->>'deadline')::timestamptz<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM work_fence f JOIN tenant t ON t.id=f.tenant_id WHERE f.tenant_id=r.tenant_id AND f.crawl_id=r.id AND NOT f.quarantined AND f.deletion_epoch=t.deletion_epoch AND t.policy_profile_id='local-synthetic-v1') THEN RAISE EXCEPTION 'run_fenced'; END IF;
 IF NOT EXISTS(SELECT 1 FROM control.health WHERE singleton AND policy_version='discovery-v1' AND restore_ready AND verified_until>clock_timestamp()) THEN RAISE EXCEPTION 'policy_unavailable'; END IF;
 SELECT * INTO s FROM site WHERE tenant_id=r.tenant_id AND id=r.site_id;
 SELECT * INTO b FROM evidence_bundle WHERE tenant_id=r.tenant_id AND site_id=r.site_id AND id=wanted_bundle AND state='frozen';
 IF NOT FOUND THEN RAISE EXCEPTION 'bundle_membership_required'; END IF;
 SELECT * INTO scope_receipt FROM site_scope_acceptance WHERE tenant_id=r.tenant_id AND site_id=r.site_id AND crawl_id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_receipt_required'; END IF;
 SELECT * INTO snapshot FROM page_snapshot WHERE tenant_id=r.tenant_id AND site_id=r.site_id AND crawl_id=r.id AND id=wanted_snapshot AND state='captured' AND NOT truncated AND status_code BETWEEN 200 AND 299;
 IF NOT FOUND OR snapshot.knowledge_seq>b.known_seq THEN RAISE EXCEPTION 'snapshot_unavailable'; END IF;
 SELECT t.* INTO parent FROM crawl_target t JOIN page p ON p.tenant_id=t.tenant_id AND p.site_id=t.site_id AND p.url_key=t.url_key WHERE t.tenant_id=r.tenant_id AND t.crawl_id=r.id AND t.admitted AND p.id=snapshot.page_id;
 IF NOT FOUND OR parent.depth>=6 THEN RAISE EXCEPTION 'parent_unavailable'; END IF;
 IF (SELECT count(*) FROM record_link WHERE tenant_id=r.tenant_id AND owner_id=b.id AND field_name='observation_ids' AND target_id IN (scope_receipt.observation_id,snapshot.observation_id,robots_obs))<>3
   OR EXISTS(SELECT 1 FROM observation WHERE tenant_id=r.tenant_id AND id IN (scope_receipt.observation_id,snapshot.observation_id,robots_obs) AND (site_id<>r.site_id OR knowledge_seq>b.known_seq OR fresh_until<=clock_timestamp())) THEN RAISE EXCEPTION 'bundle_membership_required'; END IF;
 SELECT * INTO prior FROM fixture_link_batch WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND page_snapshot_id=wanted_snapshot;
 IF FOUND THEN IF prior.input_hash<>digest THEN RAISE EXCEPTION 'conflict'; END IF; RETURN prior.result; END IF;
 IF EXISTS(SELECT 1 FROM fixture_frontier_batch WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND robots_observation_id<>robots_obs) OR EXISTS(SELECT 1 FROM fixture_link_batch WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND robots_observation_id<>robots_obs) THEN RAISE EXCEPTION 'robots_context_conflict'; END IF;
 IF jsonb_typeof(candidates) IS DISTINCT FROM 'array' OR jsonb_array_length(candidates)>5000 OR jsonb_typeof(exclusions) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'schema_invalid'; END IF;
 UPDATE knowledge_clock SET seq=knowledge_clock.seq+1,recorded_at=greatest(clock_timestamp(),knowledge_clock.recorded_at) WHERE tenant_id=r.tenant_id RETURNING knowledge_clock.seq,knowledge_clock.recorded_at INTO seq,at_time;
 INSERT INTO knowledge_commit VALUES(r.tenant_id,seq,at_time);
 SELECT count(*) INTO current_count FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id;
 FOR item IN SELECT value FROM jsonb_array_elements(candidates) ORDER BY (value->>'priority')::integer,value->>'url' COLLATE "C" LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& ARRAY['url','priority','allowed','source']) OR (SELECT count(*) FROM jsonb_object_keys(item))<>4 OR jsonb_typeof(item->'allowed') IS DISTINCT FROM 'boolean' OR jsonb_typeof(item->'url') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'priority') IS DISTINCT FROM 'number' OR (item->>'priority')::integer NOT IN (1,3) OR length(item->>'url') NOT BETWEEN 1 AND 4096 OR left(item->>'url',length(s.normalized_origin)+1)<>s.normalized_origin||'/' THEN RAISE EXCEPTION 'schema_invalid'; END IF;
  IF jsonb_typeof(item->'source') IS DISTINCT FROM 'object' OR NOT ((item->'source') ?& ARRAY['evidence_id','sha256','locator','parser_version']) OR (SELECT count(*) FROM jsonb_object_keys(item->'source'))<>4
    OR item->'source'->>'evidence_id' IS DISTINCT FROM snapshot.evidence_id::text OR item->'source'->>'sha256' IS DISTINCT FROM snapshot.content_hash
    OR item->'source'->>'parser_version' IS DISTINCT FROM 'parse5@8.0.1/aios-html-extract-v1' OR coalesce(item->'source'->>'locator','') !~ '^bytes:[0-9]{1,7}:[0-9]{1,7}$' THEN RAISE EXCEPTION 'source_locator_invalid'; END IF;
  IF split_part(item->'source'->>'locator',':',2)::bigint>=split_part(item->'source'->>'locator',':',3)::bigint OR split_part(item->'source'->>'locator',':',3)::bigint>(SELECT bytes FROM evidence WHERE tenant_id=r.tenant_id AND site_id=r.site_id AND id=snapshot.evidence_id) THEN RAISE EXCEPTION 'source_locator_invalid'; END IF;
  SELECT id INTO target FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND url_key=item->>'url';
  IF NOT FOUND THEN
   IF current_count>=5000 THEN overflow:=overflow+1;CONTINUE;END IF;
   path:=split_part(substr(item->>'url',length(s.normalized_origin)+1),'?',1);
   SELECT count(DISTINCT CASE WHEN strpos(url,'?')=0 THEN '' ELSE substr(url,strpos(url,'?')) END) INTO variant_count FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND split_part(substr(url,length(s.normalized_origin)+1),'?',1)=path AND reason IS DISTINCT FROM 'query_variants';
   why:=CASE WHEN variant_count>=20 THEN 'query_variants' WHEN NOT (item->>'allowed')::boolean THEN 'robots_denied' ELSE NULL END;
   target:=gen_random_uuid();
   INSERT INTO crawl_target VALUES('CrawlTarget',target,1,1,at_time,at_time,at_time,NULL,CASE WHEN why IS NULL THEN 'discovered' ELSE 'excluded' END,'operations',r.tenant_id,r.site_id,r.id,item->>'url',item->>'url',parent.depth+1,'link',parent.id,false,(item->>'priority')::bigint,0,why,seq);
   INSERT INTO record_link VALUES(r.tenant_id,target,'provenance_ids',0,snapshot.observation_id,'Observation'),(r.tenant_id,target,'provenance_ids',1,robots_obs,'Observation'),(r.tenant_id,target,'provenance_ids',2,b.id,'EvidenceBundle'),(r.tenant_id,target,'provenance_ids',3,snapshot.evidence_id,'Evidence');
   inserted:=inserted+1;current_count:=current_count+1;
  END IF;
 END LOOP;
 SELECT greatest(0,500-count(*)) INTO slots FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND admitted;
 UPDATE crawl_target SET admitted=true,state='queued',reason=NULL,version=version+1,updated_at=at_time,knowledge_seq=seq WHERE tenant_id=r.tenant_id AND id IN(SELECT id FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND NOT admitted AND state='discovered' AND url_key IN (SELECT value->>'url' FROM jsonb_array_elements(candidates) WHERE (value->>'allowed')::boolean) ORDER BY priority,depth,url_key COLLATE "C" LIMIT slots);
 UPDATE crawl_target SET state='deferred',reason='admission_budget',version=version+1,updated_at=at_time,knowledge_seq=seq WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND NOT admitted AND state='discovered' AND url_key IN (SELECT value->>'url' FROM jsonb_array_elements(candidates));
 SELECT jsonb_build_object('inserted_count',inserted,'discovered_count',count(*),'admitted_count',count(*) FILTER(WHERE admitted),'excluded_count',count(*) FILTER(WHERE state='excluded'),'deferred_count',count(*) FILTER(WHERE state='deferred'),'overflow_count',overflow,'source_excluded',exclusions) INTO result FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id;
 INSERT INTO fixture_link_batch VALUES(r.tenant_id,r.site_id,r.id,wanted_snapshot,robots_obs,b.id,digest,candidates,result,at_time);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION control.discover_fixture_links(uuid,uuid,uuid,uuid,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.discover_fixture_links(uuid,uuid,uuid,uuid,text,jsonb,jsonb) TO aios_runtime;

-- A run retains one robots interpretation across both discovery paths.
CREATE FUNCTION guard_frontier_robots_context() RETURNS trigger LANGUAGE plpgsql SET search_path=aios,pg_catalog AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM fixture_frontier_batch WHERE tenant_id=NEW.tenant_id AND crawl_id=NEW.crawl_id AND robots_observation_id<>NEW.robots_observation_id) OR EXISTS(SELECT 1 FROM fixture_link_batch WHERE tenant_id=NEW.tenant_id AND crawl_id=NEW.crawl_id AND robots_observation_id<>NEW.robots_observation_id) THEN RAISE EXCEPTION 'robots_context_conflict'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_frontier_robots_context BEFORE INSERT ON fixture_frontier_batch FOR EACH ROW EXECUTE FUNCTION guard_frontier_robots_context();
CREATE TRIGGER guard_frontier_robots_context BEFORE INSERT ON fixture_link_batch FOR EACH ROW EXECUTE FUNCTION guard_frontier_robots_context();
