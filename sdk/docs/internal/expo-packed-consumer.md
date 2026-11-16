---
title: Packed Expo consumer and private EAS preparation
---

# Packed Expo consumer and private EAS preparation

Prepare the Expo pilot outside the monorepo so its build input contains the
packed SDK, not a workspace link. Android still needs a reachable versioned
Maven repository. Follow [Android artifact preparation](android-artifacts.md)
first; a local staging directory cannot be uploaded as an EAS dependency.

The Expo project stays under `inth-com`, with project ID
`a4186a8b-fb45-4e42-8a91-c0de020d048a`. Do not create a replacement project under
a personal account. The plugin accepts `eas init`, `eas project:init` and
`eas project:info`; these configure a native app and do not launch Expo Go.

## Prepare the app

Build and pack `packages/react-native`, then run:

```sh
python3 internals/fixtures/expo-dev/scripts/prepare-packed-consumer.py \
  --package /absolute/path/c15t-react-native.tgz \
  --output /absolute/path/empty-consumer-directory
```

The output must be outside the checkout. The helper copies the app without
installed dependencies or generated native projects, stores the tarball at
`vendor/c15t-react-native.tgz`, and changes the dependency to that relative
path. Its `.easignore` keeps the tarball in the uploaded build input and excludes
local environment files. Metro uses Expo's normal resolver in the packed app.
No producer checkout path is needed on a cloud builder.

Add `--cell expo-55` (or another Expo cell in `scripts/mobile-compatibility.json`
that has `expoPackages` pins) to
take that cell's Expo, React Native and React, and its `expoPackages` pins for
the fixture's other Expo packages, instead of the fixture's versions. The pins
are exact because `expo install` picks the newest patch at run time, which the
three-day release-age gate in `bunfig.toml` can refuse. The helper also
copies the bare fixture's vendor code that the E2E host imports.
`internals/fixtures/expo-dev/scripts/vendor-e2e.sh` does all of this when
`C15T_EXPO_CELL` is set.

In that consumer directory:

```sh
bun install --ignore-scripts
C15T_LOCAL_PODS=false EXPO_PUBLIC_C15T_FAKE_NATIVE=false \
  bun x expo prebuild --platform android --clean --no-install
```

`C15T_LOCAL_PODS=false` disables the fixture's separate local Apple-core override.
The packed SDK carries the shared Swift core, Apple installer and SwiftUI
presenter sources. Build the generated iOS workspace to verify CocoaPods
compilation; record runtime acceptance separately.

The shipped plugin accepts `androidMavenRepository`. It has no default
repository. The fixture explicitly selects the private pilot GitHub Packages
URL, or the `C15T_MAVEN_URL` environment override at prebuild time:

```ts
androidMavenRepository: {
  url: 'https://maven.pkg.github.com/inthhq/c15t-private',
  credentials: {
    usernameEnvironmentVariable: 'C15T_MAVEN_USERNAME',
    passwordEnvironmentVariable: 'C15T_MAVEN_TOKEN',
  },
}
```

These are environment variable names, never credential values. Supply both
values through the supported secure build environment. Gradle reads them at
configuration time and fails if either is absent, including during IDE sync or
tasks such as `clean`. The plugin never reads their
values into app configuration, generated Gradle files or `extra.c15t`.
The URL must use HTTPS without embedded credentials, query parameters or a
fragment. An absolute `file:///...` URL is accepted only for local staging,
without credentials. Never upload that local URL to a cloud builder.

The plugin writes a managed `exclusiveContent` block in Expo's Groovy root
`build.gradle`. Repeated CNG replaces that block rather than appending copies;
changing or removing the prop updates or removes it. `com.c15t` resolves only
from the configured repository. Earlier repositories cannot supply matching
coordinates, and missing artifacts fail without fallback. Kotlin DSL hosts
must configure the equivalent settings-owned block themselves. The bare RN
fixture uses the same exclusive repository contract. Neither fixture substitutes
a native source project.

For local staging, pass `C15T_MAVEN_URL=file:///absolute/path/maven-staging` to
both prebuild and Gradle. Prebuild records the explicit URL, so changing the
environment later requires another prebuild. Run the real host check from the
consumer directory, without any React Native directory or Codegen override:

```sh
sh android/gradlew -p android :app:dependencies \
  --configuration releaseRuntimeClasspath --console=plain
```

Gradle's dependency report can exit zero with unresolved coordinates. Check its
output for `FAILED`, then assemble the app. Resolution alone does not prove an
APK build or launch.

Repeat prebuild with the same inputs and compare the generated Gradle settings,
root build script and manifest before native assembly. CNG output alone does
not establish successful Android or iOS builds. The local artifact smoke runner
checks packed RN bridge compilation and R8 separately from full app builds.

## Local packed runtime smoke

After assembling the packed consumer's Release APK, run:

```sh
python3 internals/fixtures/expo-dev/scripts/packed-launch-android.py \
  --apk /absolute/path/consumer/android/app/build/outputs/apk/release/app-release.apk \
  --out /absolute/path/new-evidence-directory
```

The runner creates and deletes its own Android 36 AVD. It disables Wi-Fi and
mobile data before launching the hosted-default app, then uses the shared native
prompt to reject, checks denied gates and the compact outcome, restarts the
process, and opens restored native preferences. It preserves screenshots,
accessibility hierarchies, a recording and the APK hash. The bundled demo
resource must still be valid; do not renew its disclosure dates for this check.
This smoke does not send a hosted receipt or prove packed iOS runtime behavior.

Use `--refresh-dependencies` when rebuilding against a local staging repository
whose development coordinates were replaced. Remote published coordinates must
remain immutable.

## EAS profiles and remaining gates

The fixture supplies two internal-distribution profiles:

- `development` creates a development client and an Android APK. It uses the
  `development` EAS environment and needs Metro for normal development.
- `preview` creates a release app with an embedded JS bundle and an Android APK.
  It uses the `preview` EAS environment. Verify the produced bundle and offline
  cold start on the installable artifact before recording that acceptance.

Both profiles select the real native runtime and disable the local Apple pod
override. Configure a reachable test backend as
`EXPO_PUBLIC_C15T_BACKEND_URL` in each EAS environment. The fixture defaults to
`https://example-inth.inth.app/`; use an authorized test project for delivery. Configure Maven read access and
signing credentials through the secure `inth-com` account/CI flow. Keep tokens,
keys, provisioning profiles and certificates out of the tarball and app config.

Use a separate repository for the prepared app, or EAS's supported no-VCS flow,
so the consumer directory is the archive root. Inspect the EAS build archive
before requesting a build: it must contain the relative vendor tarball, app
sources/assets, `package.json`, the consumer lockfile, `app.config.ts` and
`eas.json`. It must not depend on another checkout or a file URL on the producer.
Do not run cloud builds until the native coordinates resolve remotely.

`runtimeVersion.policy` is `fingerprint`, so native dependency/configuration
changes require a matching native build. This policy is preparation for OTA
validation; it does not prove safe rejection of an incompatible update. Keep
the existing native/JS protocol checks and exercise the failure on built apps.

EAS authentication and project linking are the baseline. Package availability,
signing access, paid-plan entitlements, successful cloud builds, artifact links,
tester installation, offline startup and OTA acceptance remain unverified until
the corresponding checks run. Full TCF 2.4, AC v2 and certification remain
first-release gates.
