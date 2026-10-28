---
title: Android artifact preparation and consumer checks
---

# Android artifact preparation and consumer checks

The Android RN adapter consumes `com.c15t:c15t-core` and
`com.c15t:c15t-android` at one pinned native version. It does not include the
native Gradle build in an app's build. The producer can use AGP 9 without
loading that plugin into Expo 57 / RN 0.86's AGP 8.12 host.

These tasks prepare a private pilot. Staging files locally does not complete
ENG-513: a clean consumer must still resolve an uploaded, versioned artifact
from a reachable repository. No public Maven, npm, app-store or signed native
release runs as part of this check.

## Artifact boundaries

- `c15t-core` is a JVM JAR. Consent, IAB decisions, hydration, durable commit
  logic and the queue remain native. Its dependency graph contains Kotlin and
  serialization, without Android, RN, Expo or UI.
- `c15t-android` is an AAR. It adds Android persistence, transport, startup and
  lifecycle services and exports the core as an API dependency. It has no stock
  UI dependency.
- The packed RN adapter compiles its bridge with the host's Kotlin plugin and
  consumes both binaries. Stock Compose UI belongs in a separate optional
  artifact; consuming the platform AAR must not install it.

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
native/core-android/gradlew -p native/core-android \
  :c15t-core:test :c15t-android:testDebugUnitTest \
  :c15t-core:publishAllPublicationsToStagingRepository \
  :c15t-android:publishAllPublicationsToStagingRepository \
  --no-configuration-cache
```

Both coordinates are written under `native/core-android/build/maven-staging`.
Each publication includes Maven POM and Gradle module metadata, sources and
Dokka HTML API documentation in the `javadoc` classifier. The JAR/AAR contains
Apache 2.0 license text, the root NOTICE attribution and native version metadata. JVM shrinker rules ship
under `META-INF/proguard`; platform rules retain the initializer that AndroidX
Startup discovers through the merged manifest.

`c15t.native.version` in `native/core-android/gradle.properties` is the native
artifact version. `verifyNativeVersion` refuses publication when it differs
from `C15tProtocol.DEFAULT_SDK_VERSION`, the default request and bridge native
SDK metadata. The RN JavaScript package version is independent; changing its
version alone must not relabel the native engine. Update the native version,
request metadata and RN artifact pin together for a native release. The
protocol number is a separate compatibility field and stays `1` until its wire
contract changes. Native SDK semver is also separate from the IAB 12-bit internal
CMP version. Neither version establishes registration or certification. Do not
use fixture CMP ID 28 as a production identity.

## Configure a real consumer repository

The private pilot publication target is
`https://maven.pkg.github.com/inthhq/c15t-private`. Its availability and package
access must be checked through the secure account/CI flow before use. A GitHub
repository token without `read:packages` cannot establish whether the Maven
packages exist. Repository access alone is insufficient.

The standalone bridge reads `C15T_MAVEN_URL`, `C15T_MAVEN_USERNAME` and
`C15T_MAVEN_TOKEN`. An app must declare the same Maven repository in its own
repository configuration; the library's standalone settings do not configure
its host. For a host using settings-owned repositories, use the
`exclusiveContent` declaration in
`native/core-android/consumer-smoke/android/settings.gradle`, replacing the
`c15t.repository` provider with the approved HTTPS repository. For a standard
RN host with project-owned repositories, add this explicit block to the root
`android/build.gradle`. Replace the URL with the approved repository:

```groovy
allprojects {
  repositories {
    exclusiveContent {
      forRepository {
        maven {
          url = uri('https://maven.example.com/c15t')
          credentials {
            username = System.getenv('C15T_MAVEN_USERNAME')
            password = System.getenv('C15T_MAVEN_TOKEN')
            if (!username || !password) {
              throw new GradleException('Set Maven credentials in the build environment.')
            }
          }
        }
      }
      filter { includeGroup('com.c15t') }
    }
  }
}
```

Keep `com.c15t` exclusive to that repository with `exclusiveContent`, not a
`content` filter on one Maven repository. A content filter alone still lets
earlier repositories supply these coordinates. Exclusive routing fails when
the configured repository lacks an artifact, without falling back elsewhere. Do not add `mavenLocal()`,
`includeBuild` for the native core, or dependency substitutions. Set
`c15t.core.version` in the host's Gradle properties when validating another
native prerelease. Credentials belong in environment variables supplied by the
secure account/CI flow, never in app configuration or committed Gradle files.

Remote publication is disabled by default. A release operator can opt into the
fixed private target with `C15T_MAVEN_PUBLISH=true`. Configuration then requires
all four secure values: `C15T_MAVEN_USERNAME`, `C15T_MAVEN_TOKEN`,
`C15T_MAVEN_SIGNING_KEY` (ASCII-armored in-memory key) and
`C15T_MAVEN_SIGNING_PASSWORD`. The `privateGitHub` publication tasks sign the
publications. No signing material is read from the checkout. This preparation
does not authorize running those tasks or establish that credentials,
permissions, package visibility or signatures have been validated.

## Repeat isolated resolution and R8

The smoke runner creates a consumer outside the checkout with fresh Gradle and
Bun caches. It never uses Maven local. It runs a JVM consumer test, checks the
resolved headless dependency graph, builds a minified Android release APK and
requires both an R8 mapping and the merged startup initializer.

For local staging proof:

```sh
python3 native/core-android/consumer-smoke/verify.py \
  --staging-repository native/core-android/build/maven-staging \
  --version 3.0.0-alpha.1
```

To add the installed RN bridge and real Codegen output, first build and pack the
RN package, then pass its tarball as `--rn-package /absolute/path/package.tgz`.
The runner keeps the Gradle root in `consumer/android` and the npm install in
`consumer/node_modules`, matching a normal scoped installation. It leaves
`c15t.spec.source` unset so normal Codegen detection runs. The runner installs RN 0.86.3 and React 19.2.7 into the isolated consumer. This
checks packed bridge compilation against the Expo toolchain; it is not a full
Expo or RN app launch.

For external resolution proof, replace `--staging-repository` with
`--repository https://maven.pkg.github.com/inthhq/c15t-private` after the
version exists there and read credentials are available. This mode rejects
file URLs and embedded credentials. The runner records `remote-resolution`
only after the build succeeds using that repository. Local mode copies the
staged files outside the checkout and records `local-staging-only`.

The retained output directory contains `result.json`, dependency caches, Gradle
reports, the unsigned release APK and the R8 mapping. Keep this evidence outside
the repository. An APK produced here is build evidence, not device,
performance, certification, registry or EAS proof.
