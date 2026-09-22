# Production analytics fixture exclusions

## Bounded inventory

Liminal excludes a production session only when retained evidence binds its exact ID to a named supervised runner and overlapping telemetry. The reviewed inventory covers the recovery run ending **2026-09-22T15:15:38.246Z**; it is not a complete classification of traffic before or after that cutoff.

Runner receipt: `evidence/supervised-release/recovery-2/remote-attempt-4/judge-paths-receipt.json`

Telemetry receipt: `evidence/supervised-release/monitoring-closure/product-events-readback.json`

| Session ID | Rows | First event | Last event |
| --- | ---: | --- | --- |
| `session_c46e2092560843af9e72b14000f49400` | 9 | 2026-09-22T15:15:33.954Z | 2026-09-22T15:15:37.590Z |

The previously listed IDs `session_485a72b53d2c44c682e8af86eda6ced1`, `session_01cb1a22031a4732a13c86d3ee6041a5`, `session_f21f5ec5647043ad95ba54c6801db8de`, `session_a0643db4b79842eab5c976bb66d9e067`, and `session_4bfa784cfbdf4601af8194436f7107b5` have no retained named-run binding. They are intentionally not excluded. Their rows, if present, remain in the unclassified population.

The earlier aggregate that reported 50 of 50 sampled production events excluded did not contain per-session provenance and must not be treated as proof of fixture ownership. The original readback remains preserved as historical evidence; this bounded inventory supersedes its classification claim.

## Counter meaning

- `fixture_events_excluded` counts rows whose exact production session ID is in the evidence-backed inventory.
- `unclassified_events_retained` counts all sampled production rows not in that inventory. It can contain genuine users, unproven QA sessions, or other traffic; it is not a verified-human count.
- `genuine_events_retained` remains as a backward-compatible alias for `unclassified_events_retained`. Its historical name does not strengthen the classification claim.
- The query is read-only. It does not delete or rewrite retained event rows, and the production inventory is not applied to staging or test traffic.

## Receipt-first updates

For each future supervised production run:

1. Before emitting events, create a named runner receipt that records the run identity, newly generated session IDs, and bounded start time. Never reuse a prior session ID.
2. After the run, retain a read-only telemetry receipt showing each exact session ID, event count, and first/last event time inside the runner window.
3. Leave any session unclassified unless both receipts establish the same exact ID and overlapping window. Do not infer ownership from a timestamp or filename.
4. Append only fully bound IDs to `queries/production-product-events-summary.sql`; add focused tests for every added ID, near matches, uncertain IDs, staging isolation, and unchanged source-row counts.
5. Require narrow review of the per-ID mapping and exact-head test evidence before using the updated exclusion in a report.
