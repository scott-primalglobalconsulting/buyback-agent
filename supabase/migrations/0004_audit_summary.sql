-- 0004_audit_summary.sql
-- Persist the LLM-judged first-hire recommendation on the audit row so the
-- audit-detail page can render summary.firstHireRole / firstHireJustification
-- without re-running the model (these are LLM judgments, not recomputable from
-- the stored items).
--
-- ADDITIVE, NULLABLE columns only. NO RLS CHANGE: RLS on `audits` is enabled
-- and policed by 0002_rls.sql (audits_all keys off is_workspace_member on the
-- row's workspace_id). Column-level grants are not used, so the existing
-- row-level policies already gate reads/writes of these new columns. Existing
-- cross-workspace isolation is therefore unaffected, and existing audit rows
-- keep NULL for both columns (no backfill).

alter table audits add column first_hire_role text;
alter table audits add column first_hire_justification text;
