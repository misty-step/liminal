# Generated app releases

Status: proposed; accepted on independent implementation review.

Policy: https://foundations.mistystep.io/
Convention: https://github.com/misty-step/harness/blob/master/docs/release-convention.md

Liminal is one release unit. Full-SHA-pinned release-please v5.0.0 (bundled
release-please 17.6.0), Node manifest strategy, owns package.json's version,
.release-please-manifest.json, CHANGELOG.md, the v-prefixed tag and GitHub Release.
The adoption baseline is 0.1.0 at 64439006f77bf3da10c0a0b780982dd1f72e734d;
older history is not retrospectively released. No prior release tags exist.
There is no special pre-1.0 policy: fix → patch, feat → minor, breaking → 1.0.0.
Subsequent baselines are the generator's immutable release tags.

The release workflow prepares/publishes metadata only after the real CI
passes and its source is still master. Native release jobs serialize without
cancellation; stale runs do not publish. The bot's generated PR receives real
native CI through narrowly scoped workflow approval, never a passing stand-in.
Squash-only merging retains the checked PR title and an empty commit body.

CHANGELOG.md is the only notes artifact. Next's native build configuration
inlines it into the bundle; /changelog statically renders it using react-markdown
(escaped HTML, no runtime filesystem, browser credentials or fetch).
The initial adoption build honestly shows an empty state until the generated
release PR lands. The page extends the existing typography, mark and paper/ink
tokens; its dark theme follows the system without changing the game design.
The existing game has no dark theme; that pre-existing gap is not repaired here.

Metadata publication is not app deployment. The existing artifact promotion and
native code recovery path stays unchanged. Neither path runs the daily writer,
paid inference, remote migrations, or data/credential restoration.
