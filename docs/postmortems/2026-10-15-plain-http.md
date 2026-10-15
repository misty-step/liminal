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
Independent review re-ran the validator: the exact payload passed, and an
unknown target field, an unknown match field and status 309 were each rejected.

Activation from merged `master` `f17db14` (PR #20), after its CI passed:

- 17:50:52Z: the entrypoint was still absent (10003) and the dry run passed.
- 17:50:53Z: `POST /rulesets` created ruleset `f3a46b251d044efcbd00f28b9fefa6cf`
  with rule `7b466386d77948cb847a3636e56ce522` (`liminal_http_to_https`,
  version 1). The ruleset GET and the phase-entrypoint GET each held only that
  rule, equal field for field to `ops/https-redirect.json` (SHA-256
  `a2031c48…dafc5b54fdaec`). A dry-run of the rollback DELETE returned 200 and
  removed nothing. Always Use HTTPS stayed `off` and HSTS stayed disabled.
- The edge converged within a minute: probes at 17:51:01Z were mixed, and every
  probe from 17:51:39Z on redirected.

Read-only proof at 17:52:36Z and 17:53:24Z: HTTP HEAD returned 308 with the
exact HTTPS URL as `Location` for `/`, `/s/ABCDE?source=https-check`,
`/api/health`, an HTML-referenced `/_next/static/` chunk, a nonexistent path,
`/?`, `/api/judge` and `/s/a%2Fb?x=a%2Bb&x=two&empty=`. GET matched, and
following the redirect reached HTTPS 200. HTTPS statuses matched the 17:49Z
baseline, health reported deck and storage `ok`, all 14 HTML-referenced assets
were byte-identical, and Worker version `d7279abb` stayed active at 100%.
`http://foundations.mistystep.io/` still returned 200: other hosts are
untouched. The 308 carries no `Cache-Control`, so clients may cache it.

Status: recovered. Rollback is the single-rule DELETE in the operations guide.
Nothing yet alerts if the rule is removed; an outside probe asserting the HTTP
308 is a proposed follow-up.
