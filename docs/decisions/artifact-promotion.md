# Artifact promotion

Status: accepted by implementation review before deployment.

Shared policy: https://foundations.mistystep.io/
Release metadata convention: https://github.com/misty-step/harness/blob/master/docs/release-convention.md

Liminal has one app Worker, separate from the nightly puzzle writer. This first
slice closes code delivery and native recovery; generator adoption and public
notes are the next slice, not claimed by this decision.

CI uses pinned Bun and the lockfile. It builds OpenNext with the existing public
Sentry DSN and exact commit identity, then produces the final Wrangler bundle
once. The existing browser stories run against that bundle with isolated local
D1 and no judge/deploy credentials. Synthetic browser Sentry traffic is blocked.
A checksummed archive retains bundle, modules and static assets together.

The sole production path consumes the successful default-branch CI artifact,
refuses a moved or foreign source, and deploys with bundling disabled. Promotions
are serialized. Health reports the package version and build revision; server
Sentry uses the same compiled revision rather than rewriting its old secret.
All existing secrets and vars are preserved. No database migration, schedule
writer, paid calibration or credential restoration belongs in code promotion.

The previous healthy, fully active native Worker version is the recovery target.
On any deployment/readback failure, native rollback restores that version and
provider plus live health are rechecked. Automatic rollback does not restore
D1, accepted reports/events, browser progress, or credentials. A mixed-version
baseline is refused because it has no single unambiguous recovery target.

Existing `USER_STORIES.md` becomes `SPEC.md` unchanged except for the delivery
story. Semantic judge quality remains the recorded deck/prompt calibration;
code-only CI cannot purchase inference to manufacture new calibration proof.
Release alarms remain the existing operations intake work, not a second sink.
