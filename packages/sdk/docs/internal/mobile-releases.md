---
title: Native mobile releases
description: How Swift, Android and React Native release from this repository, and what is still disabled.
---

# Native mobile releases

Swift, Android and React Native each release from their own workflow, apart
from the CLI and the web SDK. All three are disabled. [CI.md](../../../../.github/CI.md#releases)
is the source of truth for the release workflows; this page adds the mobile
details.

This automation does not complete mobile release acceptance. Keep native
publication disabled until the gates in [mobile-support.md](mobile-support.md)
have passed. Remote consumers, true offline startup, live screen readers and
physical-device behavior still need their own recorded evidence.

## What each line publishes

| Product | Workflow | Publishes | Tags |
| --- | --- | --- | --- |
| Swift | `release-swift.yml` | Git tags that SwiftPM reads from the root `Package.swift` | Plain semver, such as `1.2.3` |
| Android | `release-android.yml` | `com.inth:inth-core`, `com.inth:inth-android` and `com.inth:inth-consent-ui` to Maven Central | `android@<version>` |
| React Native | `release-react-native.yml` | `@inth/react-native` to npm | `react-native@<version>` |

The root `Package.swift` declares `InthCore`, `InthApple` and `InthConsentUI`
with paths under `packages/swift`. SwiftPM fetches the repository, but only the
selected Swift targets and their dependencies compile. Only the Swift line may
create plain semver tags, so the other lines use a prefixed tag.

The three Android artifacts share one version, `inth.native.version` in
`packages/android/gradle.properties`.

`@inth/react-native` has `"private": true` in its `package.json`. Keep that
flag until the release is approved; removing it is a reviewed activation change.

## How a release runs today

Each workflow runs by hand only, on `main` in `inthhq/inth`. It first runs
`ci.yml` for its own product. Then `tools/ci/release-guard.ts` stops the publish
job while the product's repository variable (`SWIFT_RELEASE_ENABLED`,
`ANDROID_RELEASE_ENABLED` or `REACT_NATIVE_RELEASE_ENABLED`) is not `true`. It
also refuses any `c15t`, `@c15t/*` or `com.c15t` artifact, even with the
variable set.

The publish step in each workflow is a placeholder that fails. Nothing in these
workflows can publish yet. To turn a line on: wire its publish step, give that
job the permissions it needs, put its credentials in a protected environment,
then set the variable.

## Maven Central tooling

`scripts/publish-maven.ts` stages, bundles, uploads and publishes the signed
Android artifacts through the Central Portal API. Its actions are `stage`,
`bundle`, `upload`, `status`, `publish` and `discard-failed`. No workflow runs
it yet. `INTH_MAVEN_CENTRAL=true` makes the Gradle build sign the local staging
publications and select public SCM metadata; it does not upload them. See
[Android artifacts](android-artifacts.md).

For Android, the `com.inth` namespace must be verified in Sonatype Central
Portal, with a publisher token and a signing key whose public key is
distributed through the normal public-key process. Keep these credentials in
the secure account or CI setup. Do not put them in notes, Gradle properties,
app configuration or chat.

After a first publication, resolve a clean SwiftPM consumer from the remote
semver tag and run the Android clean-consumer verifier against Maven Central.
Confirm all three coordinates resolve without local substitutions before
announcing a supported release.
