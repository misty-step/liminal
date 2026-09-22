-- Production-only product-event analytics with exact exclusion of sessions
-- bound to both a named supervised run and overlapping telemetry. Rows that do
-- not match remain unclassified; they are not asserted to be human traffic.
-- See docs/production-analytics-fixture-exclusions.md for the bounded inventory.
WITH classified AS (
  SELECT
    event_name,
    CASE
      WHEN session_id IN (
        'session_c46e2092560843af9e72b14000f49400'
      ) THEN 1
      ELSE 0
    END AS is_fixture
  FROM product_events
  WHERE environment = 'production'
),
summary AS (
  SELECT
    COUNT(*) AS sampled_events,
    COALESCE(SUM(is_fixture), 0) AS fixture_events_excluded,
    COALESCE(SUM(1 - is_fixture), 0) AS unclassified_events_retained
  FROM classified
)
SELECT
  'summary' AS record_type,
  NULL AS event_name,
  NULL AS event_count,
  sampled_events,
  fixture_events_excluded,
  -- Backward-compatible alias; this does not certify human traffic.
  unclassified_events_retained AS genuine_events_retained,
  unclassified_events_retained
FROM summary
UNION ALL
SELECT
  'event_count' AS record_type,
  event_name,
  COUNT(*) AS event_count,
  NULL AS sampled_events,
  NULL AS fixture_events_excluded,
  NULL AS genuine_events_retained,
  NULL AS unclassified_events_retained
FROM classified
WHERE is_fixture = 0
GROUP BY event_name
ORDER BY record_type DESC, event_name;
