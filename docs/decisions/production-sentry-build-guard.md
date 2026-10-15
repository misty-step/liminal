# Require browser Sentry identity in production builds

Accepted 2026-10-15; repair `t_c8476774`.

## Context

[LIMINAL-1](../postmortems/2026-10-15-randomuuid-analytics-crash.md) exposed a
silent browser-monitoring gap: an off-lane build omitted the browser DSN and
release, and its server release label did not identify the served source.
The README build command also omitted the browser DSN. A quiet issue was not
proof of recovery.

## Decision

`next.config.ts` owns one build-time guard. If either
`NEXT_PUBLIC_SENTRY_ENVIRONMENT` or `SENTRY_ENVIRONMENT` is `production`, loading
the config fails unless `NEXT_PUBLIC_SENTRY_DSN` is nonblank and
`NEXT_PUBLIC_SENTRY_RELEASE` equals `SENTRY_RELEASE`, both the same 40-hex SHA.
The error names the required variables without printing their values.

The README deploy command reads the public browser DSN from the build shell;
no DSN value is committed. Environments other than production remain unchanged,
including development, CI (`test`), and unlabelled local builds. `NODE_ENV` alone
does not activate the guard: Next uses production mode for local and CI builds.

`next.config.test.ts` loads the real config for both production triggers,
rejection cases, complete identities, and non-production environments. This
changes build validation only: no runtime, dependency, schema, credential, or
production-state change is needed. It checks presence and format, not DSN
ownership or whether an arbitrary 40-hex value identifies the checked-out tree;
the clean-master deploy lane remains responsible for source custody.
