SET search_path=aios,pg_catalog;
-- Narrow command only: submission may record intent, never grant fetch authority.
CREATE FUNCTION control.seed_submitted_target(run_id uuid, normalized_url text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=aios,pg_catalog AS $$
DECLARE r crawl%ROWTYPE; s site%ROWTYPE; target uuid;
BEGIN
 SELECT * INTO r FROM crawl WHERE tenant_id=tenant_scope() AND id=run_id AND submitted_by=user_scope() AND state='queued' AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope_denied'; END IF;
 PERFORM authorize('write',r.site_id);
 SELECT * INTO s FROM site WHERE tenant_id=r.tenant_id AND id=r.site_id;
 IF NOT FOUND OR s.submitted_url<>normalized_url THEN RAISE EXCEPTION 'scope_denied'; END IF;
 INSERT INTO crawl_target(record_type,id,schema_version,version,created_at,recorded_at,updated_at,deleted_at,state,retention_class,tenant_id,site_id,crawl_id,url,url_key,depth,seed_kind,discovered_from_id,admitted,priority,attempts,reason,knowledge_seq)
 VALUES('CrawlTarget',gen_random_uuid(),1,1,r.recorded_at,r.recorded_at,r.recorded_at,NULL,'discovered','operations',r.tenant_id,r.site_id,r.id,normalized_url,normalized_url,0,'submitted',NULL,false,0,0,NULL,r.knowledge_seq)
 ON CONFLICT(tenant_id,crawl_id,url_key) DO NOTHING;
 SELECT id INTO target FROM crawl_target WHERE tenant_id=r.tenant_id AND crawl_id=r.id AND url_key=normalized_url;
 RETURN target;
END $$;
REVOKE ALL ON FUNCTION control.seed_submitted_target(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.seed_submitted_target(uuid,text) TO aios_runtime;
