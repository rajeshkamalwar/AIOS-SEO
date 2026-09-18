SET search_path=aios,pg_catalog;
CREATE TABLE fixture_frontier_batch (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,sitemap_observation_id uuid NOT NULL,
 robots_observation_id uuid NOT NULL,bundle_id uuid NOT NULL,input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL,recorded_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,crawl_id,sitemap_observation_id),
 FOREIGN KEY(tenant_id,site_id,crawl_id) REFERENCES crawl(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,sitemap_observation_id) REFERENCES observation(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,robots_observation_id) REFERENCES observation(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,bundle_id) REFERENCES evidence_bundle(tenant_id,id)
);
ALTER TABLE fixture_frontier_batch ENABLE ROW LEVEL SECURITY; ALTER TABLE fixture_frontier_batch FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON fixture_frontier_batch USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER immutable_frontier_batch BEFORE UPDATE OR DELETE ON fixture_frontier_batch FOR EACH ROW EXECUTE FUNCTION reject_mutation();
GRANT SELECT ON fixture_frontier_batch TO aios_runtime,aios_scheduler,aios_evaluator,aios_operator;

CREATE FUNCTION guard_target_provenance() RETURNS trigger LANGUAGE plpgsql SET search_path=aios,pg_catalog AS $$ BEGIN
 IF current_user IN ('aios_runtime','aios_scheduler','aios_evaluator','aios_operator') AND EXISTS(SELECT 1 FROM record_index WHERE tenant_id=NEW.tenant_id AND id=NEW.owner_id AND record_type='CrawlTarget') THEN RAISE EXCEPTION 'governed_frontier_required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_target_provenance BEFORE INSERT ON record_link FOR EACH ROW EXECUTE FUNCTION guard_target_provenance();

-- Called only by the trusted fixture coordinator after exact artifact validation.
-- This grants durable target classification, never a fetch job or external tool.
CREATE FUNCTION control.discover_fixture_sitemap(wanted_run uuid,wanted_bundle uuid,sitemap_obs uuid,robots_obs uuid,digest text,candidates jsonb,exclusions jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=aios,pg_catalog AS $$
DECLARE r crawl%ROWTYPE;s site%ROWTYPE;b evidence_bundle%ROWTYPE;scope_receipt site_scope_acceptance%ROWTYPE;
 prior fixture_frontier_batch%ROWTYPE;item jsonb;target uuid;current_count integer;variant_count integer;inserted integer:=0;overflow integer:=0;
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
 IF (SELECT count(*) FROM record_link WHERE tenant_id=r.tenant_id AND owner_id=b.id AND field_name='observation_ids' AND target_id IN (scope_receipt.observation_id,sitemap_obs,robots_obs))<>3
   OR EXISTS(SELECT 1 FROM observation WHERE tenant_id=r.tenant_id AND id IN (scope_receipt.observation_id,sitemap_obs,robots_obs) AND (site_id<>r.site_id OR knowledge_seq>b.known_seq OR fresh_until<=clock_timestamp())) THEN RAISE EXCEPTION 'bundle_membership_required'; END IF;
 SELECT * INTO prior FROM fixture_frontier_batch WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND sitemap_observation_id=sitemap_obs;
 IF FOUND THEN IF prior.input_hash<>digest THEN RAISE EXCEPTION 'conflict'; END IF; RETURN prior.result; END IF;
 IF (SELECT count(*) FROM fixture_frontier_batch WHERE tenant_id=r.tenant_id AND crawl_id=r.id)>=20 THEN RAISE EXCEPTION 'sitemap_budget'; END IF;
 IF EXISTS(SELECT 1 FROM fixture_frontier_batch WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND robots_observation_id<>robots_obs) THEN RAISE EXCEPTION 'robots_context_conflict'; END IF;
 IF jsonb_typeof(candidates) IS DISTINCT FROM 'array' OR jsonb_array_length(candidates)>5001 OR jsonb_typeof(exclusions) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'schema_invalid'; END IF;
 UPDATE knowledge_clock SET seq=knowledge_clock.seq+1,recorded_at=greatest(clock_timestamp(),knowledge_clock.recorded_at) WHERE tenant_id=r.tenant_id RETURNING knowledge_clock.seq,knowledge_clock.recorded_at INTO seq,at_time;
 INSERT INTO knowledge_commit VALUES(r.tenant_id,seq,at_time);
 SELECT count(*) INTO current_count FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id;
 FOR item IN SELECT value FROM jsonb_array_elements(candidates) ORDER BY (value->>'priority')::integer,value->>'url' COLLATE "C" LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& ARRAY['url','priority','allowed']) OR (SELECT count(*) FROM jsonb_object_keys(item))<>3 OR jsonb_typeof(item->'allowed') IS DISTINCT FROM 'boolean' OR jsonb_typeof(item->'url') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'priority') IS DISTINCT FROM 'number' OR (item->>'priority')::integer NOT BETWEEN 0 AND 2 OR length(item->>'url') NOT BETWEEN 1 AND 4096 OR left(item->>'url',length(s.normalized_origin)+1)<>s.normalized_origin||'/' THEN RAISE EXCEPTION 'schema_invalid'; END IF;
  SELECT id INTO target FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND url_key=item->>'url';
  IF NOT FOUND THEN
   IF current_count>=5000 THEN overflow:=overflow+1;CONTINUE;END IF;
   path:=split_part(substr(item->>'url',length(s.normalized_origin)+1),'?',1);
   SELECT count(DISTINCT CASE WHEN strpos(url,'?')=0 THEN '' ELSE substr(url,strpos(url,'?')) END) INTO variant_count FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND split_part(substr(url,length(s.normalized_origin)+1),'?',1)=path AND reason IS DISTINCT FROM 'query_variants';
   why:=CASE WHEN variant_count>=20 THEN 'query_variants' WHEN NOT (item->>'allowed')::boolean THEN 'robots_denied' ELSE NULL END;
   target:=gen_random_uuid();
   INSERT INTO crawl_target VALUES('CrawlTarget',target,1,1,at_time,at_time,at_time,NULL,CASE WHEN why IS NULL THEN 'discovered' ELSE 'excluded' END,'operations',r.tenant_id,r.site_id,r.id,item->>'url',item->>'url',0,'sitemap',NULL,false,(item->>'priority')::bigint,0,why,seq);
   INSERT INTO record_link VALUES(r.tenant_id,target,'provenance_ids',0,sitemap_obs,'Observation'),(r.tenant_id,target,'provenance_ids',1,robots_obs,'Observation'),(r.tenant_id,target,'provenance_ids',2,b.id,'EvidenceBundle');
   inserted:=inserted+1;current_count:=current_count+1;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM record_link WHERE tenant_id=r.tenant_id AND owner_id=target AND field_name='provenance_ids') THEN
    INSERT INTO record_link VALUES(r.tenant_id,target,'provenance_ids',0,scope_receipt.observation_id,'Observation'),(r.tenant_id,target,'provenance_ids',1,robots_obs,'Observation'),(r.tenant_id,target,'provenance_ids',2,b.id,'EvidenceBundle');
   END IF;
   UPDATE crawl_target SET state='excluded',reason='robots_denied',version=version+1,updated_at=at_time,knowledge_seq=seq WHERE tenant_id=r.tenant_id AND id=target AND NOT admitted AND state='discovered' AND NOT (item->>'allowed')::boolean;
  END IF;
 END LOOP;
 SELECT greatest(0,500-count(*)) INTO slots FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND admitted;
 UPDATE crawl_target SET admitted=true,state='queued',reason=NULL,version=version+1,updated_at=at_time,knowledge_seq=seq WHERE tenant_id=r.tenant_id AND id IN(SELECT id FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND NOT admitted AND state='discovered' AND url_key IN (SELECT value->>'url' FROM jsonb_array_elements(candidates) WHERE (value->>'allowed')::boolean) ORDER BY priority,depth,url_key COLLATE "C" LIMIT slots);
 UPDATE crawl_target SET state='deferred',reason='admission_budget',version=version+1,updated_at=at_time,knowledge_seq=seq WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND NOT admitted AND state='discovered' AND url_key IN (SELECT value->>'url' FROM jsonb_array_elements(candidates));
 SELECT jsonb_build_object('inserted_count',inserted,'discovered_count',count(*),'admitted_count',count(*) FILTER(WHERE admitted),'excluded_count',count(*) FILTER(WHERE state='excluded'),'deferred_count',count(*) FILTER(WHERE state='deferred'),'overflow_count',overflow,'source_excluded',exclusions) INTO result FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id;
 INSERT INTO fixture_frontier_batch VALUES(r.tenant_id,r.site_id,r.id,sitemap_obs,robots_obs,b.id,digest,result,at_time);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION control.discover_fixture_sitemap(uuid,uuid,uuid,uuid,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.discover_fixture_sitemap(uuid,uuid,uuid,uuid,text,jsonb,jsonb) TO aios_runtime;
