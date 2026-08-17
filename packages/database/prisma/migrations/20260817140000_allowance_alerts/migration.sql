-- Allowance alerts, shipped inert.
--
-- `ad_alerts_enabled` defaults to FALSE on purpose. The accumulator's arithmetic
-- is verified against seeded data, but it has never seen a real ad account — so
-- the shape of Meta's own numbers is unverified, and an alert system in that
-- state must not be able to reach a client's inbox. With the flag off the alert
-- path still runs and still records what it would have sent, which is the dry
-- run.
--
-- Idempotent, per this repository's migration rules.

ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "ad_alerts_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ad_allowance_alert" (
  "id"                 TEXT         NOT NULL,
  "organization_id"    TEXT         NOT NULL,
  "month"              VARCHAR(7)   NOT NULL,
  "threshold"          INTEGER      NOT NULL,
  -- Every threshold crossed in the same run. A jump from 60% to 92% crosses 70
  -- and 85 at once, and two independent rows would lose that they were one event.
  "fired_with"         INTEGER[]    NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "used_pct_at_fire"   INTEGER      NOT NULL,
  "ad_set_named"       TEXT,
  -- Null means recorded but not sent: the dry-run state.
  "notified_at"        TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ad_allowance_alert_pkey" PRIMARY KEY ("id")
);

-- This index IS the "fire once per threshold per month" guarantee. Without it a
-- poller at 86% re-notifies every fifteen minutes and the sender gets filtered
-- long before the 100% alert matters.
CREATE UNIQUE INDEX IF NOT EXISTS "ad_allowance_alert_org_month_threshold_key"
  ON "ad_allowance_alert" ("organization_id", "month", "threshold");
CREATE INDEX IF NOT EXISTS "ad_allowance_alert_org_month_idx"
  ON "ad_allowance_alert" ("organization_id", "month");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ad_allowance_alert_organization_id_fkey'
  ) THEN
    ALTER TABLE "ad_allowance_alert"
      ADD CONSTRAINT "ad_allowance_alert_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Tenant-scoped like every other table carrying organization_id, so isolation
-- cases 11 and 12 stay satisfied without an exemption list. A client may
-- legitimately see their own alert history; it contains percentages, not money.
ALTER TABLE "ad_allowance_alert" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ad_allowance_alert";
CREATE POLICY tenant_isolation ON "ad_allowance_alert" FOR ALL
    USING ("organization_id" = app.current_organization_id());
