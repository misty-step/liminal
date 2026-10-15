# Liminal served the game over plain HTTP

Date: 2026-10-15. Repair: `t_393a8eae`.
Trigger: independent review of [LIMINAL-1](2026-10-15-randomuuid-analytics-crash.md).

## Impact and cause

All four recorded LIMINAL-1 errors carried the HTTP origin. An insecure context
hides `crypto.randomUUID` even in current browsers. PR #18 independently repaired
that crash, but did not secure the transport: HTTP players could still send
answers, reports and anonymous session IDs in clear text, and share HTTP links.
The observations establish exposure, not interception or a count of HTTP players.

Fresh read-only checks at 17:32Z on 2026-10-15 returned HTTP 200 for `/`,
`/s/ABCDE?source=https-check` and `/api/health`. HTTPS returned 200 too, with
health reporting deck/storage `ok`. Cloudflare had no dynamic redirect entrypoint
(error 10003), zone-wide Always Use HTTPS was `off`, and HSTS was disabled. A
custom domain and a working certificate did not themselves enforce HTTPS.

## Repair and prevention

`ops/https-redirect.json` defines one Cloudflare Single Redirect matching only
`liminal.mistystep.io` on an unencrypted connection. It returns 308 to the fixed
HTTPS origin with the original raw path and query, for every request method and
before Worker/static-asset routing. HTTPS and all other hosts are excluded.
There are no app, dependency, production-data, schema or credential changes.
Zone-wide Always Use HTTPS and HSTS remain untouched.

The [operations guide](../operations/https-redirect.md) owns apply/readback gates,
read-only regression probes (including static assets and encoded/repeated query
values), and a one-command rollback deleting only this rule. A redirect does not
undo an already sent HTTP body; clients should submit directly to HTTPS. No
production POST or analytics fixture is part of verification.

## Verification and recovery status

The real Cloudflare `POST /zones/<zone>/rulesets?dry_run=true` validator accepted
the exact repo payload with HTTP 200, `success: true`, no errors, and a null
result. A subsequent entrypoint GET still returned error 10003, proving the
dry-run did not create a rule. The validator first rejected an unsupported
scheme field; the corrected rule uses the documented `ssl` connection predicate.

Production application is pending independent review. The releasing reviewer
must append actual rule/ruleset IDs, apply/readback time, exact matched payload,
HTTP 308/Location probes, unchanged HTTPS/build identity and healthy storage
before closing the repair. This note does not claim that validation is recovery.
