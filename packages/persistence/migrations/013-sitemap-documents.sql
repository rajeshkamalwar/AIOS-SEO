SET search_path=aios,pg_catalog;
CREATE TABLE fixture_sitemap_document (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,crawl_id uuid NOT NULL,observation_id uuid NOT NULL,
 source_url text NOT NULL CHECK(length(source_url) BETWEEN 1 AND 4096),body_evidence_id uuid NOT NULL,receipt_evidence_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('urlset','text','sitemapindex')),depth integer NOT NULL CHECK(depth BETWEEN 0 AND 2),parent_observation_id uuid,
 children jsonb NOT NULL CHECK(jsonb_typeof(children)='array' AND jsonb_array_length(children)<=5000),recorded_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,crawl_id,observation_id),UNIQUE(tenant_id,crawl_id,source_url),
 FOREIGN KEY(tenant_id,crawl_id,observation_id) REFERENCES fixture_frontier_batch(tenant_id,crawl_id,sitemap_observation_id),
 FOREIGN KEY(tenant_id,crawl_id,parent_observation_id) REFERENCES fixture_sitemap_document(tenant_id,crawl_id,observation_id),
 FOREIGN KEY(tenant_id,site_id,observation_id) REFERENCES observation(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,body_evidence_id) REFERENCES evidence(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id,receipt_evidence_id) REFERENCES evidence(tenant_id,site_id,id),
 CHECK((depth=0 AND parent_observation_id IS NULL) OR (depth>0 AND parent_observation_id IS NOT NULL))
);
ALTER TABLE fixture_sitemap_document ENABLE ROW LEVEL SECURITY;ALTER TABLE fixture_sitemap_document FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped ON fixture_sitemap_document USING(tenant_id=tenant_scope()) WITH CHECK(tenant_id=tenant_scope());
CREATE TRIGGER immutable_sitemap_document BEFORE UPDATE OR DELETE ON fixture_sitemap_document FOR EACH ROW EXECUTE FUNCTION reject_mutation();
GRANT SELECT ON fixture_sitemap_document TO aios_runtime,aios_scheduler,aios_evaluator,aios_operator;
CREATE FUNCTION control.retain_sitemap_document(wanted_run uuid,wanted_observation uuid,wanted_kind text,wanted_depth integer,wanted_parent uuid,wanted_children jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=aios,pg_catalog AS $$
DECLARE r crawl%ROWTYPE;a http_fixture_acceptance%ROWTYPE;e evidence%ROWTYPE;parent fixture_sitemap_document%ROWTYPE;child jsonb;b fixture_frontier_batch%ROWTYPE;
BEGIN
 SELECT * INTO r FROM crawl WHERE tenant_id=tenant_scope() AND id=wanted_run AND submitted_by=user_scope() AND state IN ('queued','running') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_denied'; END IF;PERFORM authorize('write',r.site_id);
 IF (r.budget->>'deadline')::timestamptz<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM work_fence f JOIN tenant t ON t.id=f.tenant_id WHERE f.tenant_id=r.tenant_id AND f.crawl_id=r.id AND NOT f.quarantined AND f.deletion_epoch=t.deletion_epoch AND t.policy_profile_id='local-synthetic-v1') THEN RAISE EXCEPTION 'run_fenced'; END IF;
 IF NOT EXISTS(SELECT 1 FROM control.health WHERE singleton AND policy_version='discovery-v1' AND restore_ready AND verified_until>clock_timestamp()) THEN RAISE EXCEPTION 'policy_unavailable'; END IF;
 SELECT * INTO b FROM fixture_frontier_batch WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND sitemap_observation_id=wanted_observation;
 IF NOT FOUND THEN RAISE EXCEPTION 'batch_required'; END IF;
 SELECT * INTO a FROM http_fixture_acceptance WHERE tenant_id=r.tenant_id AND site_id=r.site_id AND observation_id=wanted_observation;
 IF NOT FOUND OR a.body_evidence_id IS NULL THEN RAISE EXCEPTION 'source_unavailable'; END IF;
 SELECT * INTO e FROM evidence WHERE tenant_id=r.tenant_id AND site_id=r.site_id AND id=a.body_evidence_id AND state='available' AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'source_unavailable'; END IF;
 IF wanted_kind IS NULL OR wanted_kind NOT IN ('urlset','text','sitemapindex') OR wanted_depth IS NULL OR wanted_depth NOT BETWEEN 0 AND 2 OR jsonb_typeof(wanted_children) IS DISTINCT FROM 'array' OR jsonb_array_length(wanted_children)>5000 THEN RAISE EXCEPTION 'schema_invalid'; END IF;
 IF wanted_kind<>'sitemapindex' AND jsonb_array_length(wanted_children)<>0 THEN RAISE EXCEPTION 'schema_invalid'; END IF;
 IF wanted_parent IS NULL THEN IF wanted_depth<>0 THEN RAISE EXCEPTION 'parent_invalid'; END IF;
 ELSE
  SELECT * INTO parent FROM fixture_sitemap_document WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND observation_id=wanted_parent AND kind='sitemapindex';
  IF NOT FOUND OR parent.depth+1<>wanted_depth OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(parent.children) x WHERE x->>'url'=e.source_uri AND x->>'state'='eligible') THEN RAISE EXCEPTION 'parent_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM record_link WHERE tenant_id=r.tenant_id AND owner_id=b.bundle_id AND field_name='observation_ids' AND target_id=parent.observation_id) OR (SELECT count(*) FROM record_link WHERE tenant_id=r.tenant_id AND owner_id=b.bundle_id AND field_name='evidence_ids' AND target_id IN(parent.body_evidence_id,parent.receipt_evidence_id))<>2 THEN RAISE EXCEPTION 'bundle_membership_required'; END IF;
 END IF;
 FOR child IN SELECT value FROM jsonb_array_elements(wanted_children) LOOP
  IF jsonb_typeof(child) IS DISTINCT FROM 'object' OR NOT (child ?& ARRAY['url','state']) OR (SELECT count(*) FROM jsonb_object_keys(child))<>2 OR jsonb_typeof(child->'url') IS DISTINCT FROM 'string' OR length(child->>'url') NOT BETWEEN 1 AND 4096 OR coalesce(child->>'state','') NOT IN ('eligible','robots_denied','depth_deferred','already_seen') THEN RAISE EXCEPTION 'schema_invalid'; END IF;
  IF wanted_depth=2 AND child->>'state'='eligible' THEN RAISE EXCEPTION 'depth_budget'; END IF;
 END LOOP;
 INSERT INTO fixture_sitemap_document VALUES(r.tenant_id,r.site_id,r.id,wanted_observation,e.source_uri,a.body_evidence_id,a.receipt_evidence_id,wanted_kind,wanted_depth,wanted_parent,wanted_children,clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION control.retain_sitemap_document(uuid,uuid,text,integer,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.retain_sitemap_document(uuid,uuid,text,integer,uuid,jsonb) TO aios_runtime;
