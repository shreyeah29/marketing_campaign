-- ═══════════════════════════════════════════════════════════════════════════════
-- Verify the ad-spend accumulator against Meta, by hand.
--
--     psql "$DIRECT_DATABASE_URL" -f scripts/verify-ad-spend.sql
--
-- Read-only. Run it in the Render shell against production.
--
-- The accumulator stores one number per organisation — `ad_spent_this_month` —
-- and three separate things read it: the allowance bar, the pace selector's
-- "22% remains", and the 100% pause. If that number is wrong, all three are
-- confidently wrong, so it is worth checking against Meta directly once rather
-- than trusting it because the arithmetic looks right.
--
-- How to use the output:
--
--   Section 2 lists the per-day spend rows the accumulator summed, per campaign.
--   Open Meta Ads Manager, set the date range to the same month, break down by
--   day, and compare. They should match to the paisa, because these rows are
--   Meta's own figures upserted verbatim.
--
--   Section 3 shows the sum against what is stored. A mismatch means the
--   accumulator has not run since the rows changed — expected within a poll
--   interval, wrong if it persists.
--
--   Section 4 is the check that matters most: rows dated outside the month that
--   is being accumulated. Attribution is by the row's own date, so this should
--   always be empty for the current month. Anything here means a run at midnight
--   put one month's spend in another's total.
-- ═══════════════════════════════════════════════════════════════════════════════

\pset pager off

\echo ''
\echo '── 1. Organisations, allowance state ────────────────────────────────────'
SELECT
  o.name,
  o.timezone,
  o.ad_spend_month                                    AS accumulating_into,
  to_char(o.ad_allocation_monthly / 100.0, 'FM999G999G999D00') AS allocation,
  to_char(o.ad_spent_this_month   / 100.0, 'FM999G999G999D00') AS spent_stored,
  CASE
    WHEN o.ad_allocation_monthly > 0
      THEN round(o.ad_spent_this_month::numeric / o.ad_allocation_monthly * 100)
    ELSE NULL
  END                                                 AS used_pct
FROM organization o
WHERE o.deleted_at IS NULL
ORDER BY o.name;

\echo ''
\echo '── 2. Per-day spend rows — compare these against Meta Ads Manager ───────'
SELECT
  o.name        AS org,
  ai.date,
  c.name        AS campaign,
  ai.impressions,
  ai.clicks,
  ai.leads,
  ai.spend      AS spend_major
FROM ad_insight ai
JOIN organization o ON o.id = ai.organization_id
LEFT JOIN ad_campaign c ON c.id = ai.campaign_id
WHERE o.deleted_at IS NULL
  AND to_char(ai.date, 'YYYY-MM') = coalesce(o.ad_spend_month, to_char(now(), 'YYYY-MM'))
ORDER BY o.name, ai.date, c.name;

\echo ''
\echo '── 3. Summed rows vs the stored figure ──────────────────────────────────'
\echo '     A gap within one poll interval is normal. A persistent gap is not.'
WITH summed AS (
  SELECT
    ai.organization_id,
    round(sum(ai.spend) * 100)::bigint AS computed_minor
  FROM ad_insight ai
  JOIN organization o ON o.id = ai.organization_id
  WHERE to_char(ai.date, 'YYYY-MM') = coalesce(o.ad_spend_month, to_char(now(), 'YYYY-MM'))
  GROUP BY ai.organization_id
)
SELECT
  o.name,
  coalesce(s.computed_minor, 0) AS computed_minor,
  o.ad_spent_this_month         AS stored_minor,
  coalesce(s.computed_minor, 0) - o.ad_spent_this_month AS difference_minor,
  CASE
    WHEN coalesce(s.computed_minor, 0) = o.ad_spent_this_month THEN 'match'
    ELSE 'MISMATCH — has the accumulator run?'
  END AS verdict
FROM organization o
LEFT JOIN summed s ON s.organization_id = o.id
WHERE o.deleted_at IS NULL
ORDER BY o.name;

\echo ''
\echo '── 4. Rows outside the accumulating month (should be empty) ─────────────'
\echo '     Anything here is a date-attribution bug, not a rounding one.'
SELECT
  o.name AS org,
  o.ad_spend_month AS accumulating_into,
  to_char(ai.date, 'YYYY-MM') AS row_month,
  count(*) AS rows,
  sum(ai.spend) AS spend_major
FROM ad_insight ai
JOIN organization o ON o.id = ai.organization_id
WHERE o.deleted_at IS NULL
  AND o.ad_spend_month IS NOT NULL
  AND to_char(ai.date, 'YYYY-MM') <> o.ad_spend_month
GROUP BY o.name, o.ad_spend_month, to_char(ai.date, 'YYYY-MM')
ORDER BY o.name, row_month;

\echo ''
\echo '── 5. Closed months in the ledger ───────────────────────────────────────'
SELECT
  o.name,
  l.month,
  to_char(l.spent_minor      / 100.0, 'FM999G999G999D00') AS spent,
  to_char(l.allocation_minor / 100.0, 'FM999G999G999D00') AS allocation,
  CASE
    WHEN l.allocation_minor > 0
      THEN round(l.spent_minor::numeric / l.allocation_minor * 100)
    ELSE NULL
  END AS used_pct,
  l.closed_at
FROM ad_spend_ledger l
JOIN organization o ON o.id = l.organization_id
ORDER BY o.name, l.month DESC;

\echo ''
