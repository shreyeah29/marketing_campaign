-- Row-level security for the Meta ads + WhatsApp engine's tenant-scoped tables.
-- Same contract as every other tenant table: the application role can only see or
-- write rows whose organization_id matches the current request's organisation
-- (app.current_organization_id()), so isolation holds even under raw SQL.
--
-- meta_webhook_event is deliberately excluded: it has no organization_id (the
-- tenant is resolved while processing the event), so it carries no tenant policy.

ALTER TABLE "meta_connection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "meta_connection" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "ad_campaign" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ad_campaign" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "ad_set" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ad_set" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "ad_creative" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ad_creative" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "ad" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ad" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "meta_lead_form" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "meta_lead_form" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "ad_insight" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ad_insight" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "chatbot_flow" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "chatbot_flow" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "chatbot_session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "chatbot_session" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());
