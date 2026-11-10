# c15t for Android

Native consent management for Kotlin Android apps and the Android side of
`@c15t/react-native`. One engine owns policy, durable choices, IAB authority and
SDK permissions. Jetpack Compose consent screens are optional.

Start with the [Android quickstart](../../docs/frameworks/android/quickstart.mdx).
It covers dependency resolution, Application startup, Compose presentation and a
permanent privacy-settings action. The SDK is a private prerelease; obtain the
matching versioned Maven artifacts from the maintainer.

## Guides

- [Configuration](../../docs/frameworks/android/configuration.mdx): hosted Inth,
  native metadata, scope and identity.
- [Headless integration](../../docs/frameworks/android/headless.mdx): your own UI,
  native SDK gates and revision-checked saves.
- [Customize](../../docs/frameworks/android/customize.mdx): native theme, app
  identity, provider attribution and copy.
- [Mobile IAB](../../docs/guides/mobile-iab.mdx): purpose/vendor authority,
  Additional Consent and advertising integrations.
- [Offline policy](../../docs/guides/mobile-offline.mdx): first-install prompts,
  expiry and queued delivery.
- [Verify mobile consent](../../docs/guides/mobile-verify.mdx): app acceptance.

## Modules

| Artifact | Purpose |
| --- | --- |
| `com.c15t:c15t-core` | Kotlin/JVM consent engine. Policy, storage contracts, IAB authority and synchronous gates, without Android or UI dependencies. |
| `com.c15t:c15t-android` | Android installation, protected storage, HTTP transport and foreground/reconnect services. Exposes core types. |
| `com.c15t:c15t-consent-ui` | Optional Compose screens and a ViewModel-owned presenter. |

Use the same native version for all three modules. The current version is
`3.0.0-alpha.1`; RN's npm version is separate. An app with its own UI needs only
`c15t-android`. Native [Maven artifact preparation](../../docs/internal/android-artifacts.md)
and [publication setup](../../docs/internal/mobile-releases.md) are maintainer
instructions.

## Consent and IAB authority

`C15tAndroid.install` installs and hydrates the process's native engine. Read
`C15t.current` to access it. The facade's `snapshot`, `isAllowed`, `decision` and
`isReady` methods read cached state without network or storage work.

Optional permissions stay off while authority is unresolved. `decision` reports
`PENDING`, `DENIED` or `GRANTED`. A retained `gate` or `gateDecision` subscription
keeps a vendor integration current after grants, withdrawal and policy changes.
Close the subscription when its owner ends.

The core authors and stores native IAB choices, TC Strings and Additional
Consent v2 decisions. Native drafts are bound to the current disclosure revision;
commits check policy, list freshness and restrictions. The platform adapter
mirrors IAB signals into application-default SharedPreferences for other SDKs.
Those signals do not replace the protected consent authority or establish IAB
or Google certification.

A successful `CommitResult.ok` confirms durable local storage and the queued
delivery obligation. It does not claim backend delivery. Keep refused drafts
and retry controls visible. For local start-over, use the installed kernel's
`reset`; the facade's `C15t.uninstall()` only tears down the singleton.

## Working on this package

From `native/core-android`, with JDK 17 and an Android SDK configured:

```sh
sh gradlew :c15t-core:test
sh gradlew :c15t-android:assembleDebug
sh gradlew :c15t-consent-ui:assembleDebug
sh gradlew :consent-demo:compileDebugKotlin
```

The Kotlin examples included in the public guides compile with the native demo.
Run the platform instrumentation suite separately on a dedicated test device:

```sh
sh gradlew :c15t-android:connectedDebugAndroidTest --no-build-cache
```

The [native demo](../examples/consent-demo/README.md) provides hosted setup,
local category/notice/IAB fixtures and review diagnostics. Local sample CMP
identities and synthetic disclosures are test inputs. Use the registered CMP
identity and actual hosted disclosures for verification evidence.
