---
title: Native mobile releases
description: Release SwiftPM from the monorepo and publish signed Android artifacts with Tegami.
---

# Native mobile releases

`bun run tegami:mobile` versions Swift and Android independently from the RN
npm package. SwiftPM installs directly from this monorepo through its root
`Package.swift` and Swift version tags. Android publishes `com.inth:inth-core`,
`com.inth:inth-android` and `com.inth:inth-consent-ui` to Maven Central at one
native version.

This automation does not complete mobile release acceptance. Keep native
publication disabled until the gates in [mobile-support.md](mobile-support.md)
have passed. Remote consumers, true offline startup, live screen readers and
physical-device behavior still need their own recorded evidence. The RN
package remains private. Enabling its npm publication needs a separate reviewed
manifest change and npm trusted-publisher configuration.

## Version native packages

Add a note under `.tegami/mobile/` with either or both native package IDs:

```md
---
packages:
  'swift:inth-swift': patch
  'maven:inth-android': patch
---

### Fix saved consent restoration

Restore the recorded decision before optional SDKs start.
```

The main npm flow reads only `.tegami/*.md`. It does not consume these nested
native notes. The native flow ignores npm workspaces and writes its own
`.tegami/mobile/publish-lock.yaml`. Do not edit either publish lock by hand.

Swift versioning updates `Inth.version` and regenerates the RN vendored core.
`InthApple.version` and the local core podspec continue to read that version.
Android versioning updates `inth.native.version`, request metadata and both RN
artifact pins together. It leaves the RN npm version unchanged.

Swift reserves plain semver tags such as `3.0.1-canary.0` and `3.0.1` in this
repository so SwiftPM can resolve versions. Android keeps tags such as
`inth-android@3.0.1`; npm keeps its own package tags and versions. A Swift tag
does not release the Android or npm packages at the same version.

Both release branches use the same channels as npm. `canary` produces
`X.Y.Z-canary.N`; `main` produces stable versions. Consumed canary notes replay
when promoted to stable. A publish lock records its branch, version and native
source digest. An unfinished release refuses publication from a different
branch or changed source. Completed locks do not prevent later native work or
stable promotion.

Inspect a release in a disposable checkout:

```sh
RELEASE_BRANCH=canary bun run tegami:mobile version
RELEASE_BRANCH=canary bun run tegami:mobile publish --dry-run
```

Versioning writes native versions, consumer pins, changelogs and its publish
lock. The publish dry run validates the lock without builds or uploads. Normal
publication requires the version changes to be committed first.

## Provision destinations

SwiftPM uses `https://github.com/c15t/c15t` directly. The root `Package.swift`
declares `InthCore`, `InthApple` and `InthConsentUI` with explicit paths under
`packages/swift`. SwiftPM fetches the repository and its Git metadata, but
only the selected Swift targets and their dependencies compile. The Android,
React Native and JavaScript packages are outside that build.

The release runner tests a temporary snapshot of the committed root package,
then pushes a plain semver tag at that tested source commit to the checkout's
`origin`. The snapshot is a validation artifact, not a second distribution
repository. The release lock covers the root manifest, native Swift sources,
resources and fixtures. Status checks verify an existing tag against the
recorded Swift version and source digest; the publisher never replaces a tag.
Completed releases remain verifiable after later edits to the checkout.

The workflow uses its existing `GITHUB_TOKEN` with `contents: write` to push
tags to the same repository. Local operators use the checkout's normal Git
credentials and need permission to push tags. No separate Swift repository,
Swift-specific token or SwiftPM account is required.

Developers add the monorepo URL in Xcode and select a Swift version and one or
more library products. The core includes `PrivacyInfo.xcprivacy` as a SwiftPM
resource. Standalone CocoaPods publication is outside this setup. RN CocoaPods
continues to compile its vendored sources.

For private testing, a teammate with GitHub read access can install directly
from `inthhq/c15t-private` at a branch or commit that contains the root
manifest. Normal GitHub authentication controls access to the package source.
The public release workflow still admits only `c15t/Inth`; this setup does not
enable automated private releases or claim that the mobile acceptance gates
have passed. Keep public publication disabled while private testing continues.

For Android, verify the `com.inth` namespace in Sonatype Central Portal and
create a publisher token. Provision the signing key and make its public key
available through the normal public-key distribution process. The bundle
verifier requires signatures, checksums, public SCM metadata, source and API
documentation artifacts for all three modules before upload. Central's
`USER_MANAGED` upload validates the bundle before an explicit publish request.

Create the `mobile-release` GitHub environment in `c15t/Inth`. Configure its
reviewers and branch restrictions to match the team's release policy. Set:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `C15T_NATIVE_PUBLISH` | Leave unset until native acceptance passes; then `true` |
| Secret | `C15T_CENTRAL_USERNAME` | Central publisher token username |
| Secret | `C15T_CENTRAL_TOKEN` | Central publisher token password |
| Secret | `C15T_MAVEN_SIGNING_KEY` | ASCII-armored private signing key |
| Secret | `C15T_MAVEN_SIGNING_PASSWORD` | Signing key passphrase |

Keep credentials in the secure account or CI setup. Do not put them in notes,
Gradle properties, app configuration or chat. Setup requires repository access,
Central namespace ownership and package permissions; a local staging build
cannot establish those permissions.

## Run the workflow

`.github/workflows/release-mobile.yml` runs on every push to
`canary` or `main` in `c15t/Inth`. It requires CI, uses the `mobile-release`
environment, and opens a version PR on `tegami/version-mobile-<branch>` when
notes are pending. Merging that version PR attempts the release. Publication
fails before upload unless the native release flag and destination credentials
are configured. An Android version without a saved upload journal also requires
explicit confirmation on a fresh manual run. Private copies never publish
through this workflow.

Keep the generated mobile version PR unmerged until the acceptance gates pass,
destination credentials are configured and native publication is enabled.
Merging it early leaves a pending lock that later runs must finish before
Tegami can open another mobile version PR.

Every release-branch push starts a run. An older run can finish its existing
publish lock at the original source commit, but only the branch tip can open a
new version PR. Publishing
credentials are available only to the publish step and the explicit Central
recovery step.

Before upload, the release runner tests the committed root Swift package,
stages and checks the signed Android artifacts, and validates every selected
package's environment. npm continues to publish only from `release.yml` with
its existing OIDC identity. Publish native Android artifacts before the RN npm
version that pins them. After native publication, add an RN release note and
verify the packed consumer against the remote native version before releasing RN.
The npm publish hook checks all three pinned Maven Central coordinates and
refuses the RN upload while any is unavailable.

The workflow restores saved Central state from the latest retained artifact on
the same release branch. It also accepts an explicit previous run ID:

```sh
gh workflow run release-mobile.yml --ref canary -f previous_run_id=123456789
```

For a new Android version, check Central Portal for an existing deployment of
that version before confirming a new upload:

```sh
gh workflow run release-mobile.yml --ref canary \
  -f new_maven_upload_version=3.0.0-canary.0
```

The confirmation must match the exact pending Android version. It applies only
to the first attempt of that manual run. A rerun cannot reuse the confirmation
when its journal is missing. Start another manual run only after checking Portal
again. Automatic runs never create an upload without its saved journal. Missing
or expired artifacts and public Maven 404s do not prove that no upload started.
If Portal has a pending deployment, recover its original journal and signed ZIP
instead. A confirmation never overrides an existing journal or an unknown upload
outcome. Swift releases do not require this Android confirmation.

Central validation and publication can outlast one attempt. A pending state
stops the attempt and leaves the publish lock unfinished. The workflow retains
the deployment JSON and exact signed ZIP as `mobile-release-state` for 90 days.
Later runs stop copying a version's files once all three Maven artifacts and its
remote Android tag exist. Pending uploads and published versions without a tag
keep their recovery files. Each successful restore produces a new snapshot,
including an empty one after completion or explicit discard, so older discarded
state does not return on the next run. Failed restores do not replace the latest
snapshot. A runner failure before artifact upload can still lose newly written
state; keep the original run's files and inspect Portal before confirming any
new upload.
Signing keys are temporary and are excluded from that artifact. A retry checks
the saved deployment rather than uploading again. Preserve those files until
Central reports `PUBLISHED` and Tegami completes its tags and releases.
Already published SDKs skip builds and uploads. They remain in the release plan
so missing monorepo tags and GitHub release entries can finish. Until Android's
remote tag exists, its source, version, branch and committed inputs must still
match the lock. Status checks and dry runs enforce this too. Recover at the
locked source commit if the branch has moved. A mismatching local tag is refused
instead of being pushed or replaced. An existing remote tag must resolve to the
locked version and source digest. Once it matches, later source edits can proceed
without rebuilding the completed SDK. A conflicting published tag stops the
release and must never be replaced.
If a pending SDK's source has changed on the branch, rerun a workflow whose
checkout still matches the lock with `gh run rerun RUN_ID --repo c15t/Inth`.
GitHub permits reruns for 30 days. A stale version PR can also merge after a
native fix, leaving no matching workflow run at all. In either case, recover
from the version PR's original head commit:

```sh
gh pr view VERSION_PR --repo c15t/Inth --json headRefOid --jq .headRefOid
gh workflow run release-mobile.yml --repo c15t/Inth --ref canary \
  -f source_commit=FULL_VERSION_PR_HEAD_SHA \
  -f previous_run_id=RUN_WITH_ORIGINAL_CENTRAL_STATE
```

Use the full 40-character SHA returned by the first command. Use `--ref main`
for a stable lock. Omit `previous_run_id` only when the automatic restore selects
the original state, or publication never started. If state was lost or expired,
inspect Central Portal and recover it before retrying. Public Maven 404s do not
prove an upload never started.

Recovery uses the current workflow and release tools against an isolated,
detached checkout fetched from the same origin. Its lock must match the dispatch
checkout's lock byte for byte. Pending source digests, versions and release
branch must still match. The historical Android JVM suites run before any
preparation or upload; Swift preparation tests the historical root package.
The Android digest includes every tracked file in the core and included demo
trees, plus new files that Git does not ignore. Gradle `buildSrc` and additional
build scripts cannot reuse a lock written without them. The generated Android
`CHANGELOG.md` is excluded because Tegami writes it concurrently with the lock;
it is not a build input or Maven artifact. Ignored build outputs are excluded.

Native tests receive toolchain and system settings through an environment
allowlist. They do not inherit release tokens, signing keys or Git authorization
headers. Historical Gradle tests use a new process with `--no-daemon`. Checkout
does not persist Git credentials; the publishing process supplies its Git
authorization through temporary environment configuration. This is credential
scoping, not process isolation. Native tests run as the same operating-system
user as the publisher and may inspect the parent process's environment. Only
run reviewed sources that match the lock.

The existing Central journals and signed ZIPs stay in the same external state
directory. An unknown upload outcome still blocks another upload.

Recovery runs `publish` only and cannot open a version PR. After it finishes,
dispatch the normal branch workflow to version the newer notes. Do not rewrite
the lock, replace a published tag or revert newer work to force publication.

If an upload loses its response, the saved journal intentionally has no
deployment ID. Recover the existing ID from Central Portal, then use
`publish-maven.ts upload --deployment-id ID` with the original state and ZIP.
The uploader refuses to guess or create another deployment. If a runner dies
before it can retain the artifact, inspect Central Portal before retrying and
recover the original deployment state. Do not discard state to force an upload.

A definitive HTTP 4xx upload rejection removes its local journal. After correcting
the request and checking Portal, start a fresh manual run with
`new_maven_upload_version` to retry. Network failures and HTTP 5xx responses retain
the journal because the upload outcome is uncertain.

For a deployment that Central reports as `FAILED`, retry with:

```sh
gh workflow run release-mobile.yml --ref canary \
  -f discard_failed_maven_version=3.0.0-canary.0
```

This recovery action checks the saved version and live deployment status before
removing only the local JSON. It refuses pending or published deployments and
unknown upload outcomes. The normal release step then stages a corrected bundle
and creates a new deployment of that same version. This permission applies only
to the first attempt of the manual run, after the live failure check succeeds.
The failed remote deployment remains available for inspection.

After publishing, resolve a clean SwiftPM consumer from the monorepo's remote
semver tag and run the Android clean-consumer verifier against Maven Central.
Confirm all three coordinates resolve without local substitutions. These
remote checks remain required before announcing a supported release.
Before enabling the first Central publication, retain a raw `VALIDATED` status
response from a staging deployment and verify its `purls` match all three
coordinates. The publisher requires those coordinates before its publish
request. Central's documented schema does not guarantee that field at this
stage, so this remains an activation gate.

## Activate the RN npm package

The public package name is `@inth/react-native`. It uses `release.yml`, not the
native workflow. Its manifest already declares public access, but `private: true` keeps pending RN notes out of release drafts until mobile acceptance
passes. Keep that flag until the release is approved.

For the first release, establish npm ownership of the package and configure a
GitHub Actions trusted publisher for owner `c15t`, repository `c15t`, workflow
`release.yml`. Do not add an npm token to the workflow. First-package ownership
and trusted publishing setup may require a maintainer's npm account. The public
registry returns 404 before package bootstrap; that does not prove ownership
or permission to publish.

After the pinned Android version is publicly available and the mobile gates
pass, remove `private: true` in a reviewed activation change. Verify the npm
release draft and packed bare/Expo consumers before merging its version PR.
RN includes vendored Swift sources, so its CocoaPods path does not require a
remote SwiftPM tag.
