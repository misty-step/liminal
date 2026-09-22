-- Production-only product-event analytics with exact exclusion of retained
-- supervised-release fixture sessions. This classification is intentionally
-- append-only: source rows remain unchanged and genuine traffic is retained.
WITH classified AS (
  SELECT
    event_name,
    CASE
      WHEN session_id IN (
        'session_485a72b53d2c44c682e8af86eda6ced1',
        'session_01cb1a22031a4732a13c86d3ee6041a5',
        'session_f21f5ec5647043ad95ba54c6801db8de',
        'session_a0643db4b79842eab5c976bb66d9e067',
        'session_4bfa784cfbdf4601af8194436f7107b5',
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
    COALESCE(SUM(1 - is_fixture), 0) AS genuine_events_retained
  FROM classified
)
SELECT
  'summary' AS record_type,
  NULL AS event_name,
  NULL AS event_count,
  sampled_events,
  fixture_events_excluded,
  genuine_events_retained
FROM summary
UNION ALL
SELECT
  'event_count' AS record_type,
  event_name,
  COUNT(*) AS event_count,
  NULL AS sampled_events,
  NULL AS fixture_events_excluded,
  NULL AS genuine_events_retained
FROM classified
WHERE is_fixture = 0
GROUP BY event_name
ORDER BY record_type DESC, event_name;
