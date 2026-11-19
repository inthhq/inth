---
title: Android artifact preparation and consumer checks
---

# Android artifact preparation and consumer checks

The Android RN adapter consumes `com.inth:inth-core`,
`com.inth:inth-android` and `com.inth:inth-consent-ui` at one pinned native version. It does not include the
native Gradle build in an app's build. The producer can use AGP 9 without
loading that plugin into Expo 57 / RN 0.86's AGP 8.12 host.

These tasks stage files locally. The public release target is Maven Central;
the private GitHub Packages pilot remains available for private consumers.
Staging files locally does not complete
ENG-513: a clean consumer must still resolve an uploaded, versioned artifact
from a reachable repository. No public Maven, npm, app-store or signed native
release runs as part of this check.

## Artifact boundaries

- `inth-core` is a JVM JAR. Consent, IAB decisions, hydration, durable commit
  logic and the queue remain native. Its dependency graph contains Kotlin and
  serialization, without Android, RN, Expo or UI.
- `inth-android` is an AAR. It adds Android persistence, transport, startup and
  lifecycle services and exports the core as an API dependency. It has no stock
  UI dependency.
- `inth-consent-ui` is the optional stock Compose UI AAR. Native headless apps
  can use the core and platform artifacts without installing it.
- The packed RN adapter compiles its bridge with the host's Kotlin plugin and
  consumes all three binaries to provide its stock presenter.

The native producer uses JDK 17, AGP 9.2.1 and Kotlin 2.2.10. The isolated
consumer uses Gradle 9.3.1, AGP 8.12.0 and Kotlin 2.1.20, matching the Expo 57 /
RN 0.86 Android build tools. Serialization is pinned to 1.8.1 because 1.11.0
exports Kotlin 2.3 metadata that the consumer cannot read. Both producers set
Kotlin API and language compatibility to 2.1 and the standard library baseline
to 2.1.20, including the versions in their published dependency metadata. Do not hide this
failure with `-Xskip-metadata-version-check` or a source substitution.

The fixture compiles with API 36 and declares a minimum API of 24. Compilation
and R8 do not prove API 24 device behavior or the full declared RN support
range. Expo CNG, full RN app assembly, launched apps, offline startup, OTA
compatibility, TCF 2.4 / AC v2 conformance, certification and device performance
remain separate release gates.

## Prepare versioned files

From the repository root, with JDK 17 and the Android SDK available:

```sh
packages/android/gradlew -p packages/android \
  :inth-core:test :inth-android:testDebugUnitTest \
  :inth-core:publishAllPublicationsToStagingRepository \
  :inth-android:publishAllPublicationsToStagingRepository \
  :inth-consent-ui:publishAllPublicationsToStagingRepository \
  --no-configuration-cache
```

All three coordinates are written under `packages/android/build/maven-staging`.
Each publication includes Maven POM and Gradle module metadata, sources and
Dokka HTML API documentation in the `javadoc` classifier. The JAR/AAR contains
Apache 2.0 license text, the root NOTICE attribution and native version metadata. JVM shrinker rules ship
under `META-INF/proguard`; platform rules retain the initializer that AndroidX
Startup discovers through the merged manifest.

`inth.native.version` in `packages/android/gradle.properties` is the native
artifact version. `verifyNativeVersion` refuses publication when it differs
from `InthProtocol.DEFAULT_SDK_VERSION`, the default request and bridge native
SDK metadata. The RN JavaScript package version is independent; changing its
version alone must not relabel the native engine. Update the native version,
request metadata and RN artifact pin together for a native release. The
protocol number is a separate compatibility field and stays `1` until its wire
contract changes. Native SDK semver is also separate from the IAB 12-bit internal
CMP version. Neither version establishes registration or certification. Do not
use fixture CMP ID 28 as a production identity.

## Configure a real consumer repository

The private pilot publication target is
`https://maven.pkg.github.com/inthhq/inth`. Its availability and package
access must be checked through the secure account/CI flow before use. A GitHub
repository token without `read:packages` cannot establish whether the Maven
packages exist. Repository access alone is insufficient.

The standalone bridge reads `INTH_MAVEN_URL`, `INTH_MAVEN_USERNAME` and
`INTH_MAVEN_TOKEN`. An app must declare the same Maven repository in its own
repository configuration; the library's standalone settings do not configure
its host. For a host using settings-owned repositories, use the
`exclusiveContent` declaration in
`packages/android/consumer-smoke/android/settings.gradle`, replacing the
`inth.repository` provider with the approved HTTPS repository. For a standard
RN host with project-owned repositories, add this explicit block to the root
`android/build.gradle`. Replace the URL with the approved repository:

```groovy
allprojects {
  repositories {
    exclusiveContent {
      forRepository {
        maven {
          url = uri('https://maven.example.com/inth')
          credentials {
            username = System.getenv('INTH_MAVEN_USERNAME')
            password = System.getenv('INTH_MAVEN_TOKEN')
            if (!username || !password) {
              throw new GradleException('Set Maven credentials in the build environment.')
            }
          }
        }
      }
      filter { includeGroup('com.inth') }
    }
  }
}
```

Expo consumers can use the shipped `androidMavenRepository` plugin prop instead
of editing generated native files. See [the packed Expo guide](expo-packed-consumer.md).
The plugin has no default private repository and accepts credential environment
variable names only.

Keep `com.inth` exclusive to that repository with `exclusiveContent`, not a
`content` filter on one Maven repository. A content filter alone still lets
earlier repositories supply these coordinates. Exclusive routing fails when
the configured repository lacks an artifact, without falling back elsewhere. Do not add `mavenLocal()`,
`includeBuild` for the native core, or dependency substitutions. Set
`inth.core.version` in the host's Gradle properties when validating another
native prerelease. Credentials belong in environment variables supplied by the
secure account/CI flow, never in app configuration or committed Gradle files.

Remote publication is disabled by default. A release operator can opt into the
fixed private target with `INTH_MAVEN_PUBLISH=true`. Configuration then requires
all four secure values: `INTH_MAVEN_USERNAME`, `INTH_MAVEN_TOKEN`,
`INTH_MAVEN_SIGNING_KEY` (ASCII-armored in-memory key) and
`INTH_MAVEN_SIGNING_PASSWORD`. The `privateGitHub` publication tasks sign the
publications. No signing material is read from the checkout. This preparation
does not authorize running those tasks or establish that credentials,
permissions, package visibility or signatures have been validated.

For public Maven Central releases, use the separate
[native Tegami flow](mobile-releases.md). `INTH_MAVEN_CENTRAL=true` signs the
local staging publications and selects public SCM metadata; it does not upload
them. The release verifier checks the signed bundle before Central upload and
retains the deployment ID for retries. The private GitHub pilot remains a
separate opt-in target.

## Repeat isolated resolution and R8

The smoke runner creates a consumer outside the checkout with fresh Gradle and
Bun caches. It never uses Maven local. It runs a JVM consumer test, checks the
resolved headless dependency graph, builds a minified Android release APK and
requires both an R8 mapping and the merged startup initializer.

For local staging proof:

```sh
python3 packages/android/consumer-smoke/verify.py \
  --staging-repository packages/android/build/maven-staging \
  --version 3.0.0-alpha.1
```

To add the installed RN bridge and real Codegen output, first build and pack the
RN package, then pass its tarball as `--rn-package /absolute/path/package.tgz`.
The runner keeps the Gradle root in `consumer/android` and the npm install in
`consumer/node_modules`, matching a normal scoped installation. It leaves
`inth.spec.source` unset so normal Codegen detection runs. The runner installs RN 0.86.3 and React 19.2.7 into the isolated consumer. This
checks packed bridge compilation against the Expo toolchain; it is not a full
Expo or RN app launch.

For external resolution proof, replace `--staging-repository` with
`--repository https://maven.pkg.github.com/inthhq/inth` after the
version exists there and read credentials are available. This mode rejects
file URLs and embedded credentials. The runner records `remote-resolution`
only after the build succeeds using that repository. Local mode copies the
staged files outside the checkout and records `local-staging-only`.

The retained output directory contains `result.json`, dependency caches, Gradle
reports, the unsigned release APK and the R8 mapping. Keep this evidence outside
the repository. An APK produced here is build evidence, not device,
performance, certification, registry or EAS proof.
