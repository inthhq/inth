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

In that consumer directory:

```sh
bun install --ignore-scripts
C15T_LOCAL_PODS=false EXPO_PUBLIC_C15T_FAKE_NATIVE=false \
  bun x expo prebuild --platform android --clean --no-install
```

`C15T_LOCAL_PODS=false` disables the fixture's separate local Apple-core override.
The packed SDK carries its own Swift sources. Apple installer, pod resolution and
iOS app acceptance still need the Apple stream's checks.

The generated Android root build declares an exclusive `com.c15t` Maven
repository using `C15T_MAVEN_URL`, defaulting to the private pilot GitHub Packages
URL. Supply `C15T_MAVEN_USERNAME` and `C15T_MAVEN_TOKEN` through the supported
secure environment. The generated Gradle script reads them at build time; it
does not embed credentials. The bare RN fixture uses the same repository
contract. Neither fixture substitutes a native source project.

Repeat prebuild with the same inputs and compare the generated Gradle settings,
root build script and manifest before native assembly. CNG output alone does
not establish successful Android or iOS builds. The local artifact smoke runner
checks packed RN bridge compilation and R8 separately from full app builds.

## EAS profiles and remaining gates

The fixture supplies two internal-distribution profiles:

- `development` creates a development client and an Android APK. It uses the
  `development` EAS environment and needs Metro for normal development.
- `preview` creates a release app with an embedded JS bundle and an Android APK.
  It uses the `preview` EAS environment. Verify the produced bundle and offline
  cold start on the installable artifact before recording that acceptance.

Both profiles select the real native runtime and disable the local Apple pod
override. Configure a reachable test backend as
`EXPO_PUBLIC_C15T_BACKEND_URL` in each EAS environment; the fixture's local
backend default is not a cloud test backend. Configure Maven read access and
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
