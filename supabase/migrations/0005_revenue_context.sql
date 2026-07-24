-- 0005_revenue_context.sql
-- Persist (a) the model's per-task revenue-proximity judgment and (b) the audit-
-- level context the founder supplies (revenue stage, income for the Buyback Rate,
-- team + tool budget for SOP fit).
--
-- ADDITIVE, NULLABLE columns only. NO RLS CHANGE: RLS on audits/audit_items is
-- enabled and policed by 0002_rls.sql (audits_all / audit_items_all key off
-- is_workspace_member on the row's workspace_id). Column-level grants are not
-- used, so the existing row-level policies already gate reads/writes of these new
-- columns. Cross-workspace isolation is therefore unaffected; existing rows keep
-- NULL (no backfill).

alter table audit_items add column revenue_proximity text;

alter table audits add column is_at_revenue boolean;
alter table audits add column annual_income numeric;
alter table audits add column team text;
alter table audits add column tool_budget text;
