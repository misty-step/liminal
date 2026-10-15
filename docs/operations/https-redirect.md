# Liminal HTTP → HTTPS

`ops/https-redirect.json` is the exact Cloudflare Single Redirect create payload
for zone `mistystep.io` (`82511c89ffe04f84cb6091ba0a803109`). It affects only
unencrypted requests whose host is exactly `liminal.mistystep.io`, before Worker
or static-asset routing. Every method receives **308**. The destination is the
fixed HTTPS origin plus `raw.http.request.uri` (path **and query**), so
`preserve_query_string` is deliberately false: adding it again would duplicate
the query. HTTPS and other hosts do not match. No HSTS or zone-wide Always Use
HTTPS setting is changed. The application artifact does not need redeployment.

## Validate and apply

Use the existing authorized Cloudflare API credential, never a credential in
this repository. Do not enable shell tracing or print the credential. Run from
a clean, reviewed, merged `master`; serialize this change with other zone-rule
writers. The commands below require `curl` and `jq`.

```sh
set -euo pipefail
CF_ZONE_API=https://api.cloudflare.com/client/v4/zones/82511c89ffe04f84cb6091ba0a803109
mkdir -p content/https-redirect

# Read before writing. The commissioned baseline is HTTP 404, code 10003:
# no dynamic-redirect entrypoint. Stop on any other error. If a ruleset now
# exists, do NOT replace it with this create payload; re-review an additive
# POST to /rulesets/<id>/rules using only .rules[0] from the JSON file.
curl -sS -o content/https-redirect/before.json -w '%{http_code}\n' \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "$CF_ZONE_API/rulesets/phases/http_request_dynamic_redirect/entrypoint"
jq -e '.success == false and any(.errors[]; .code == 10003)' \
  content/https-redirect/before.json

# The real Cloudflare validator; dry_run does not persist the ruleset.
curl --fail-with-body -sS \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --json @ops/https-redirect.json "$CF_ZONE_API/rulesets?dry_run=true" \
  | jq -e '.success == true and .result == null and .errors == []'

# Apply only after the read/dry-run gates and independent review pass.
curl --fail-with-body -sS \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --json @ops/https-redirect.json "$CF_ZONE_API/rulesets" \
  > content/https-redirect/apply.json
jq -e '.success == true and .errors == []' content/https-redirect/apply.json
read -r RULESET_ID RULE_ID < <(jq -er \
  '[.result.id, (.result.rules[] | select(.ref == "liminal_http_to_https") | .id)] | @tsv' \
  content/https-redirect/apply.json)

# Independent readback must match every field of the repo rule.
curl --fail-with-body -sS \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "$CF_ZONE_API/rulesets/$RULESET_ID" > content/https-redirect/after.json
jq -e --slurpfile expected ops/https-redirect.json \
  '.success == true and (.result.rules | length) == 1 and
   (.result.rules[0] | del(.id, .version, .last_updated)) == $expected[0].rules[0]' \
  content/https-redirect/after.json
```

Stop if any gate fails; do not continue through a failed command. The commands
use Bash (`read` with process substitution). Keep the returned ruleset/rule IDs
in the release record and the rollback variables in this shell. Before applying,
retain HTTPS response statuses, health JSON, referenced build assets and the
active Worker identity. After applying, compare them: this change must not alter
the served app. Read back Always Use HTTPS and `security_header` too; the
commissioned values are `off` and HSTS `enabled: false`.

## Read-only production proof

```sh
for path in '/' '/s/ABCDE?source=https-check' '/api/health'; do
  curl -sSI "http://liminal.mistystep.io$path"  # 308; exact same https URL
  curl -sSI "https://liminal.mistystep.io$path" # unchanged HTTPS status
done
curl -fsS https://liminal.mistystep.io/api/health # deck/storage ok
curl --path-as-is -sSI \
  'http://liminal.mistystep.io/s/a%2Fb?x=a%2Bb&x=two&empty='
```

Also check an HTML-referenced `/_next/static/` URL and a nonexistent path: the
edge rule must precede both asset and app routing. Compare the complete Location
including percent encoding, repeated query keys and empty values. No production
POST, gameplay, browser session, or analytics fixture is needed: the rule has no
method filter, and Cloudflare's 308 contract preserves the method and body when
a client follows it. A redirect cannot protect the client's initial HTTP request
body; callers should use HTTPS directly.

## One-command rollback

With the IDs captured above, delete **only this rule**, never the zone ruleset:

```sh
curl --fail-with-body -sS --request DELETE -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$CF_ZONE_API/rulesets/${RULESET_ID:?}/rules/${RULE_ID:?}"
```

Then GET the entrypoint again and verify `liminal_http_to_https` is absent, other
rules are unchanged, HTTPS/health still work, and fresh HTTP requests no longer
redirect. The empty phase ruleset can remain. A 308 can be cached by clients;
removing the rule stops new edge redirects but cannot erase a cached redirect.
Do not add HSTS as part of rollback or repair.

References: [Single Redirect API](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/),
[raw URI](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/raw.http.request.uri/),
[encrypted connection predicate](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/ssl/).
