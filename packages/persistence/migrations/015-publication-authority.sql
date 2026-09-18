SET search_path=aios,pg_catalog;
-- Legacy JSON rows do not carry independent publication-gate receipts or
-- dependency authority. Preserve history; no service may manufacture approval.
-- A future governed writer requires a separate reviewed acceptance contract.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON publication
 FROM PUBLIC,aios_runtime,aios_scheduler,aios_evaluator,aios_operator;
