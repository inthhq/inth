# c15t React Native fixture (Expo development build)

See the [mobile demo index](../../../packages/sdk/docs/frameworks/react-native/examples.mdx) for
current native modes, setup commands and the limits of IAB and hosted coverage.

An Expo SDK 58 custom native build for `@c15t/react-native`. Normal native mode
requests the stock SwiftUI or Compose presenter and displays native state and
outcomes. The labelled fake mode uses a separate React shell. It shares some
fixture helpers with bare RN; the apps are not identical consumer journeys.

The typed plugin config covers category setup. It does not install a complete
IAB CMP identity or prove Additional Consent authoring. Use the native local
IAB modes in the demo index for that fixture coverage.

## Expo Go will not run this app

`@c15t/react-native` is a custom native module: the consent kernel is Swift on iOS and
Kotlin on Android, registered through Codegen as the `C15t` TurboModule. Expo Go ships
a fixed set of native modules and cannot carry one added by a config plugin, so there
is no path where this app works there.

Opening it in Expo Go does not fail loudly. The JavaScript bundle loads, finds no
module, and every read answers from the deny-all default: the banner never appears,
every category is `false`, `policyPending` stays `true`, and it looks exactly like a c15t
bug. That is why the config plugin checks the launch target at configure time and
refuses rather than letting you find this out at runtime.

What you need is a development build:

```sh
bun run ios        # expo run:ios
bun run android    # expo run:android
```

Both prebuild the native projects, install pods, build, and launch into the dev client.
For a device or a shareable build, `eas build --profile development --platform all`
then `bun run start`.

`bun run start` on its own is only half a command: it serves the bundle, and you still
need the built client to open it.

## Setup

The default backend is the public Inth demo, `https://example-inth.inth.app/`.
Use your Inth project URL for your app. The plugin embeds `c15t-policy.json` before
JavaScript starts; the demo resource expires on 5 November 2026. Regenerate it
before prebuild when changing the endpoint or renewing its authority.
See [mobile policy resources](../../../packages/native-protocol/docs/mobile-policy-resources.md).
No hosted save has been verified against the public demo.

```sh
bun install                      # from the repository root
cp .env.example .env
```

`.env` is ignored; `.env.example` is the committed template. The Expo CLI loads it
before it evaluates `app.config.ts`, so one file feeds both halves:

- `app.config.ts` passes `backendURL` to the config plugin, which writes
  `com.c15t.backend.url` into `ios/Info.plist` and
  `com.c15t.BACKEND_URL` into `AndroidManifest.xml` at prebuild time. With
  `C15T_DRY_RUN=1` it also writes `com.c15t.dryRun` and `com.c15t.DRY_RUN`.
- The `EXPO_PUBLIC_` copies are inlined into the JavaScript bundle and drive what the
  screens report and which core the app attaches to.

Only the `EXPO_PUBLIC_` prefix survives into the bundle, and that is the warning: those
strings are in the shipped app, so nothing secret may use the prefix. There is no key
to configure: a project is its backend URL, and neither the plugin nor the embedded
cores carry a credential.

The core reads its backend from the native keys, not from `.env`. After changing the
URL, run `bun run prebuild` again; a running binary keeps the value it was built with.
That the bundle and the binary each carry a copy of the backend URL is a property of
the design, not a mistake in this example.

The mobile SDKs work only with Inth hosted projects, so the plugin refuses any
other host. To point a debug build at a staging or loopback backend, set
`C15T_DRY_RUN=1`. It drops consent records, and a release build refuses to start
c15t with it. Keep the native and JavaScript URLs equal and export the resource
from the same backend's manifest.

## Commands

| Command | What it does |
| --- | --- |
| `bun run prebuild` | Regenerate `ios/` and `android/` from the config (`--clean`) |
| `bun run ios` / `bun run android` | Prebuild, build, and launch the dev client |
| `bun run ios:release` | Same, release configuration, bundle inside the binary |
| `bun run start` | Dev server for a development client |
| `bun run bundle` | `expo export --platform all` into `.artifacts/export` |
| `bun run config` | Resolved prebuild config as JSON, to see what the plugin wrote |
| `bun run check-types` | `tsc --noEmit` |
| `bun run lint` / `bun run fmt` | Oxlint and Oxfmt, from the repo presets |

`ios/` and `android/` are generated and gitignored. Delete them freely; prebuild writes
them back from `app.config.ts`, and the plugin is idempotent.

The autolinked `C15tReactNative` pod compiles the generated Swift core and Apple
services. Do not add a separate `C15tCore` pod to this app. The checkout-only
`C15T_LOCAL_PODS` flag now controls Android source substitution only.

For Android, `app.config.ts` explicitly passes `androidMavenRepository` to the
shipped plugin. The fixture selects `https://maven.pkg.github.com/inthhq/c15t-private`
unless `C15T_MAVEN_URL` supplies a staging URL at prebuild time. HTTPS credentials
come from `C15T_MAVEN_USERNAME` and `C15T_MAVEN_TOKEN` when Gradle runs. No fixture
plugin adds a Maven repository. See the maintained
[packed consumer guide](../../../packages/sdk/docs/internal/expo-packed-consumer.md) for the
options, exclusive routing and clean external-consumer checks.

## Real vendor SDKs

The app links the real PostHog, Mixpanel, Amplitude, Sentry Session Replay and
Firebase Analytics SDKs through config plugins in `app.config.ts`:
`@react-native-firebase/app` and `analytics`, `@sentry/react-native/expo` with
uploads off, and `expo-build-properties` for dynamic frameworks, which React
Native Firebase needs on iOS. The placeholder Firebase project is in `vendors/`,
and `firebase.json` keeps collection and every consent type off until c15t
grants them. Normal builds link the SDKs and never start them.

An E2E build (`EXPO_PUBLIC_C15T_APP_E2E=1`) renders `src/e2e/vendor-journey-app.tsx`
instead of the shell. It starts the SDKs with the bare fixture's code in
`react-native-bare/src/vendors`, imported unchanged, so both apps prove the same
helpers. `metro-vendor-sources.js` lets Metro read those files and resolves their
packages from this app, so the bundle never picks up the bare app's React Native.

The c15t plugin accepts only an Inth project URL, and a Release build cannot use
`dryRun`. So an E2E build gives the plugin the demo project with
`autoBootstrap: false`, and `plugins/with-c15t-e2e-install.js` makes the native
app install the core against the loopback backend before React Native starts,
through c15t's internal install path. It writes `C15tE2EInstall.kt` and a call in
`MainApplication.kt` on Android, a helper and a call in `AppDelegate.swift` on
iOS, and bundles the exported policy as `c15t-e2e-policy.json` on both.

```sh
bash scripts/vendor-e2e.sh ios
bash scripts/vendor-e2e.sh android
C15T_EXPO_CELL=expo-55 bash scripts/vendor-e2e.sh ios
C15T_EXPO_CELL=expo-57 bash scripts/vendor-e2e.sh android
```

The runner builds a Release app with the bundle inside the binary and the bare
fixture's loopback backend and capture server. It creates its own Simulator or
AVD and deletes it after the run. Without `C15T_EXPO_CELL` it builds this fixture in place.
With `expo-55`, `expo-56` or `expo-57` it packs `@c15t/react-native` and uses
`scripts/prepare-packed-consumer.py --cell` to make a consumer outside the
checkout. That consumer takes Expo, React Native, React and the other Expo packages
(`expoPackages`) from that cell of `scripts/mobile-compatibility.json`. The vendor SDKs keep this fixture's pins in every cell. The committed
versions here do not change.

iOS runs `scripts/vendor-journey.swift` as an external XCUITest bundle. Android
runs `scripts/vendor-journey-android.py`, which drives UIAutomator over adb, so it
does not depend on each SDK's Gradle setup. Both take the bare fixture's vendor
steps: a fresh install and Reject all send no user data, a measurement grant
delivers the probe event (Sentry: replay segments), a withdrawal stops every
vendor once in-flight uploads settle, and a relaunch keeps the refusal.
`react-native-bare/scripts/verify-vendor-firebase.py` checks Firebase against its
own log. `summary.md` in the evidence directory lists each vendor's capture count
per step and the installed versions.

Things that differ from the bare fixture:

- Expo SDK 55 leaves async-storage's resource bundle target at iOS 13.4, which
  Xcode 27 refuses to build. `plugins/with-pod-deployment-floor.js` lifts every
  pod to 16.4 at the end of `post_install`, as the bare Podfile does by hand.
  SDK 57 raises resource bundles itself.
- Expo SDK 58 generates a `SceneDelegate.swift`, so the runner gives this
  fixture the newest installed iOS runtime. Below SDK 58 the generated app does
  not adopt the UIScene lifecycle, and iOS 27 stops such an app at launch when it
  is built with the iOS 27 SDK, so the runner picks the oldest installed runtime
  for those cells, as the bare runner does.
- The Android Release build runs R8. That is Expo SDK 58's default, and
  `app.config.ts` turns it on for the older cells too, so every Android journey
  runs minified code. The runner fails if R8 wrote no mapping file, and keeps it
  as `r8-mapping.txt.gz` for reading stack traces.
- Expo SDK 55 links a precompiled React Native core that dynamic framework pods
  cannot link against (`RCTRegisterModule` is undefined), so `app.config.ts`
  builds React Native from source below SDK 57.
- React Native Firebase 27 does not compile on Android against React Native 0.83:
  its Kotlin passes `String?` where 0.83's `Promise.reject` takes `String`. The
  expo-55 cell pins 26.4.0 through `vendorPackages` in
  `scripts/mobile-compatibility.json`. Every other cell and this fixture use 27.1.0.
- Expo SDK 55's CLI reads `tsconfig.json` through `ts.sys`, which the TypeScript 7
  native port this fixture uses does not have, so bundling stops before Metro
  starts. The expo-55 cell pins TypeScript 5.9.3 through `devPackages`.
- Android Mixpanel uses the emulator host alias `10.0.2.2`, and PostHog gets
  AsyncStorage as `customStorage`, for the same reasons as in the bare fixture.

## Native build status

Verified here: `bun run check-types` is clean, `expo export --platform all` writes
2.2 MB Hermes bundles for iOS and Android, `expo prebuild --clean --no-install` exits 0
with the `com.c15t.*` keys and the startup initializer in place, and `pod install` inside
the generated `ios/` prints

```console
Pod installation complete! There are 96 dependencies from the Podfile and 95 total pods installed.
```

with `C15tCore` and `C15tReactNative` both at 3.0.0-alpha.1, so the plugin's Podfile line,
the podspec, and the `C15t` TurboModule codegen all hold. `pod install` and `xcodebuild`
need `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` on this machine, because
`xcode-select` points at Command Line Tools.

Nobody has launched a simulator or an emulator from this fixture, and no Gradle build has
run, so the checklist below is entirely open.

Android autolinking here runs `expo-modules-autolinking`, not `@react-native-community/cli`,
which is what `expoAutolinking.rnConfigCommand` in the generated Podfile wires. So this app
never asked the question the bare app used to fail on, and it stays that way: the community
autolinking branch (`EXPO_USE_COMMUNITY_AUTOLINKING=1`) needs `@react-native-community/cli`,
which this fixture does not depend on. The bare app is where the community CLI's answer about
this package gets exercised, on CI, by `bun run check:react-native-autolink`; see
[internals/fixtures/react-native-bare](../react-native-bare#native-build-status).

## Fake core

The example ships an in-JavaScript fake core (`src/c15t/fake-native.ts`) built only on
`createConsentClient(module, events)` and `ConsentClientContext`, which is how the
package says to inject a mock: hydrate and init on timers, a 1 Hz `isAllowed` sampler
whose recent samples print on screen, a drift timer that flips one permission every few
seconds so a subscription has something to react to, a pending-write queue capped at 20
that refuses to send while the online toggle is off, and a restart that rebuilds the
client from stored state.

It is a fixture, not a second implementation. Fake mode proves the JavaScript side and
nothing about Swift, Kotlin, Keychain, AndroidKeyStore, or Codegen, and the app prints a
red strip across the top while it is active so a result cannot be misread. The real core
is the default; `EXPO_PUBLIC_C15T_FAKE_NATIVE=true` forces the fake.

## Persistence and cold-start checklist

**Do these in a build with the bundle inside the binary**, not against the dev server.
With `bun run ios`, the JavaScript comes from Metro over the network, so airplane mode
kills the app instead of the backend and every offline result you collect is meaningless.
Use `bun run ios:release`, or `eas build --profile production`.

On Android a release variant needs a signing config this example does not ship, so use
`eas build --profile production --platform android`, or run the fake core's cold-start
simulation for the JavaScript half.

Cached snapshot before any network:

1. Load the app, accept all, wait for the revision to settle.
2. Kill the app by swiping it away. Reloading from the dev menu keeps the process and
   proves nothing.
3. Turn on airplane mode.
4. Relaunch. The first frame must already show the accepted permissions and a non-zero
   revision, with `ready: true` and `policyPending: false`.
5. Fail if the first frame is deny-all with `policyPending: true`, or if the permissions
   arrive only after a visible delay: `snapshot()` is a synchronous read of stored state
   and must not wait on the network.
6. In fake mode, press **Simulate cold start** instead. It rebuilds the client under a
   fresh React key, which is what a relaunch does to the JavaScript side. **Wipe storage
   (uninstall)** covers the reinstall step below.

Queued save replayed on relaunch:

1. Start from a clean state: clear the app's storage, or press **Wipe storage
   (uninstall)** in fake mode.
2. Turn on airplane mode.
3. Accept all, or save a custom set. The action must report as queued, not failed.
4. Kill the app.
5. Turn the network back on and relaunch.
6. Pass when the backend holds exactly one save record for that action, with the same
   category set that was chosen, and the snapshot's revision moves past the stored one.
7. Fail when the record is missing, when the queue sent twice, or when the replayed body
   was rebuilt from the current policy rather than the payload that was queued.
8. Queue two actions back to back and repeat. Both must arrive, in order, unchanged.

Reinstall:

1. Delete the app, reinstall, launch. The subject id must be new, permissions must be
   deny-all with `policyPending: true` until the first init resolves, and no prompt may
   be owed that the policy does not ask for.

Two things that change results on Android: force-stopping and swiping away are not the
same, so use force-stop for a real process death. And over-the-air updates are not a way
to change the native keys, since those are compiled into the binary.

## What the config plugin writes

`bun run config` prints the resolved config; `bun run prebuild` writes it into the
native projects. After a prebuild you should find:

```
ios/c15tExpoDev/Info.plist              com.c15t.backend.url
ios/c15tExpoDev/Info.plist              NSUserTrackingUsageDescription, NSUserTrackingMarkdownUsageDescription
ios/.../Supporting/de.lproj/InfoPlist.strings   NSUserTrackingMarkdownUsageDescription
android/.../AndroidManifest.xml         <meta-data android:name="com.c15t.BACKEND_URL" ...>
android/.../AndroidManifest.xml         com.c15t.reactnative.C15tReactNativeInitializer
```

Android has no mode key; it infers the transport from which keys are present. An absent
value stays absent rather than becoming an empty string, because the bridge treats a
missing key as "not configured".

App Tracking Transparency is off by default and nothing about a consent configuration
turns it on: consent to marketing cookies is not Apple tracking authorization. This
fixture opts in, in `app.config.ts` and nowhere else, and opting in takes a
`trackingUsageDescription` you wrote yourself rather than a placeholder the plugin could
have invented.

That plain string is the alert Apple shows, and the Markdown key does not replace it:
Apple draws the plain one on every older system and to every device outside the countries
where it enabled the expanded sheet. `trackingMarkdownUsageDescription` is the copy that
expanded sheet renders, as Markdown, so bold, italics, bullets, and paragraph breaks.
Apple picks who sees it, not c15t, and no surface here reads the copy back.

`trackingMarkdownUsageDescriptionLocalizations` adds the same prompt per locale, keyed the
way Xcode spells a tag. Each entry becomes an `InfoPlist.strings` in that
`<locale>.lproj` bundle rather than another plist key, because the plist holds one value
per key. A bundle that already carries the key keeps what the host wrote.

iOS reads a string out of one of those bundles only once the binary says it speaks that
locale, so the plugin also names each locale as a region: it lands in the project's
`knownRegions` and in `CFBundleLocalizations` in the plist. Nothing here has to keep a
second copy of the locale list to match the map.

The tracking card on the Consent tab is the other half: `useTrackingRequest` runs the
sheet, the preference centre that Apple's Additional Information button sends the subject
to, and the second sheet. An Apple yes moves no category by itself, which is the whole
reason the card prints `useIsTrackingAllowed` beside the arm.


## Packed iOS offline acceptance

Run the packed smoke against an existing Simulator Release app and its SDK archive:

```sh
python3 scripts/packed-launch-ios.py --app /absolute/path/c15tExpoDev.app \
  --archive /absolute/path/c15t-react-native.tgz --out /absolute/path/new-evidence
```

The app must retain the designated hosted endpoint and the bundled policy. Build
with `CODE_SIGNING_ALLOWED=YES CODE_SIGNING_FOR_SIMULATOR=YES CODE_SIGN_IDENTITY=-`
so Xcode embeds the Simulator application entitlement required by Keychain. An
unsigned build can compile but fail the native protected-storage probe. The
runner copies the app, preserves its entitlements when signing, and creates its
own fresh Simulator. It builds only the external XCUITest runner and a network
fault library. It does not rebuild the SDK or replace archive sources.

The library loads before app startup and refuses HTTP and HTTPS requests with
`NSURLErrorNotConnectedToInternet`. The real hosted transport still constructs
its requests. `network-fault.jsonl` records each refused URL and process ID.
This is a process-scoped URL loading fault, not device radio isolation or a live
hosted receipt test. Host networking and other Simulators remain available.

XCUITest taps native Reject, checks the compact outcome and denied permissions,
kills and relaunches the app, and reopens native preferences with Measurement
off. Evidence includes screenshots, accessibility trees, the complete MP4,
native test results, runtime values, and hashes of the archive and app files.

For direct native gate evidence, run `scripts/install-packed-ios-proof.py --consumer
/absolute/path/consumer` after prebuild and before the Release build, then pass
`--native-proof` to the smoke runner. This adds a read-only native observer to the
consumer's AppDelegate. It runs only with the runner's launch environment and
records the installed core's snapshot plus actual `C15t.isAllowed` values to the
app sandbox. The smoke requires fresh bundled readings and full denial in both
processes. The SDK still comes only from the archive.

The Android packed runner accepts `--archive` to record the SDK input hash. It
waits for the default SIM to initialize on its own fresh AVD, then disables
Wi-Fi and data and enables airplane mode. Before installing the app, it requires
no default network, disabled data and an off cellular radio from the actual
connectivity and telephony services. It preserves those reports and radio
settings, and repeats the checks after relaunch.
