SET search_path=aios,pg_catalog;
GRANT SELECT ON audit_output TO aios_runtime;
-- Serialize current governance receipts with consumers at the existing work
-- boundary. Lock before clock rows, including direct SQL evaluator writes, so
-- tick -> receipt cannot invert the consumer's work -> tick lock order.
CREATE FUNCTION aios.lock_audit_eligibility() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(68273433);
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION aios.lock_audit_eligibility() FROM PUBLIC;
CREATE TRIGGER audit_clock_serialization BEFORE INSERT OR UPDATE ON knowledge_clock
 FOR EACH STATEMENT EXECUTE FUNCTION aios.lock_audit_eligibility();
CREATE TRIGGER audit_receipt_serialization BEFORE INSERT ON self_audit_result
 FOR EACH STATEMENT EXECUTE FUNCTION aios.lock_audit_eligibility();
CREATE TRIGGER audit_impact_serialization BEFORE INSERT ON audit_impact
 FOR EACH STATEMENT EXECUTE FUNCTION aios.lock_audit_eligibility();
CREATE TRIGGER audit_output_serialization BEFORE INSERT ON audit_output
 FOR EACH STATEMENT EXECUTE FUNCTION aios.lock_audit_eligibility();
CREATE TRIGGER audit_recovery_serialization BEFORE INSERT ON audit_recovery
 FOR EACH STATEMENT EXECUTE FUNCTION aios.lock_audit_eligibility();
