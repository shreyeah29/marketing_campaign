-- Tenant RLS for the demographic/geo breakdown table, matching every other
-- tenant table: a client sees only their own audience insights.

ALTER TABLE "ad_insight_breakdown" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ad_insight_breakdown" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());
