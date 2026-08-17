-- Ad allowance and the spend ledger.
--
-- Clients see performance, never money. Ads run on each client's own Meta ad
-- account but are funded by our payment method, so what was spent is our
-- commercial position: a tenant is served one derived figure, a rounded
-- percentage of allowance used, and never the rupees behind it.
--
-- Every money column here is minor units (paise), matching the rest of the
-- schema. These figures decide whether a client's ads keep running, and a rupee
-- that has been through a float comes back as 2499.9999999999995.
--
-- Idempotent throughout, per this repository's migration rules.

ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "ad_allocation_monthly" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "ad_spent_this_month" INTEGER NOT NULL DEFAULT 0;
-- The month the running total belongs to, 'YYYY-MM'. Without it a poller that
-- runs after midnight on the 1st adds August's spend to September's total.
ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "ad_spend_month" TEXT;
ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "tier" VARCHAR(40);
ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "monthly_fee" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "ad_spend_ledger" (
  "id"                TEXT         NOT NULL,
  "organization_id"   TEXT         NOT NULL,
  "month"             VARCHAR(7)   NOT NULL,
  "spent_minor"       INTEGER      NOT NULL,
  "allocation_minor"  INTEGER      NOT NULL,
  "monthly_fee_minor" INTEGER      NOT NULL DEFAULT 0,
  "closed_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ad_spend_ledger_pkey" PRIMARY KEY ("id")
);

-- One row per organisation per month; the monthly roll is idempotent because of
-- this, so running it twice cannot double-count a closed month.
CREATE UNIQUE INDEX IF NOT EXISTS "ad_spend_ledger_organization_id_month_key"
  ON "ad_spend_ledger" ("organization_id", "month");
CREATE INDEX IF NOT EXISTS "ad_spend_ledger_month_idx"
  ON "ad_spend_ledger" ("month");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ad_spend_ledger_organization_id_fkey'
  ) THEN
    ALTER TABLE "ad_spend_ledger"
      ADD CONSTRAINT "ad_spend_ledger_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Two locks, not one.
--
-- The ledger holds our margin inputs, so the application role has no business
-- reading it: the grant is revoked. But a revoked grant is one `GRANT ALL ON ALL
-- TABLES` away from coming back — the provisioning script contains exactly that
-- statement — so row-level security goes on as well. If the grant is ever
-- restored by accident, the policy still scopes what can be seen to the caller's
-- own organisation, and the cost-redaction interceptor still strips the columns
-- from any response.
--
-- Enabling RLS also keeps the tenant-isolation suite honest: cases 11 and 12
-- assert that every table carrying organization_id has RLS with a policy, and an
-- exemption list is a thing people forget to read.
ALTER TABLE "ad_spend_ledger" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ad_spend_ledger";
CREATE POLICY tenant_isolation ON "ad_spend_ledger" FOR ALL
    USING ("organization_id" = app.current_organization_id());

REVOKE ALL ON "ad_spend_ledger" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_app') THEN
    REVOKE ALL ON "ad_spend_ledger" FROM vsp_app;
  END IF;
END $$;
