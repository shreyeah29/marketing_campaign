-- Restore the application role's grant on ad_spend_ledger.
--
-- WHY THIS EXISTS
--
-- 20260817120000 revoked every privilege on ad_spend_ledger from vsp_app, on the
-- reasoning that the app plane has no business reading our margin inputs. The
-- reasoning was fine and the mechanism was wrong, because
-- `information_schema.columns` is privilege-filtered: a role with no privilege on
-- a table sees none of its columns there.
--
-- The API's boot preflight asks `information_schema.columns` which tables carry
-- an `organization_id`, and compares that against the tenant registry. With the
-- grant revoked, ad_spend_ledger vanished from the answer, the preflight
-- concluded a registered model had no tenant column, and the API refused to
-- start — correctly, by its own rules. The table was never malformed: the column
-- is called `organization_id` and always was. It was invisible, not absent.
--
-- It passed locally and in CI because both ran the check as the owner, which sees
-- every table regardless of grants. That gap is closed separately in the test.
--
-- WHAT REPLACES IT
--
-- Row-level security stays on, with its tenant_isolation policy, so the app role
-- can only ever see its own organisation's rows. No API code reads this table.
-- And the cost-redaction interceptor now strips its money columns by name, so a
-- future endpoint that serialises a ledger row cannot leak one.
--
-- The revoke was never a durable lock anyway: provision-app-role.sql contains
-- `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public`, so any
-- re-run of provisioning silently undid it. A lock that the setup script removes
-- is not a lock, and relying on it cost a deploy.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ad_spend_ledger" TO vsp_app;
  END IF;
END $$;

-- Belt and braces: assert the policy and RLS are still in place rather than
-- assuming the earlier migration's version survived. Idempotent.
ALTER TABLE "ad_spend_ledger" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ad_spend_ledger";
CREATE POLICY tenant_isolation ON "ad_spend_ledger" FOR ALL
    USING ("organization_id" = app.current_organization_id());
