# c15t React Native fixture (Expo development build)

See the [mobile demo index](../../../docs/frameworks/react-native/examples.mdx) for
current native modes, setup commands and the limits of IAB and hosted coverage.

An Expo SDK 57 custom native build for `@c15t/react-native`. Normal native mode
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
See [mobile policy resources](../../../native/docs/mobile-policy-resources.md).
No hosted save has been verified against the public demo.

```sh
bun install                      # from the repository root
cp .env.example .env
```

`.env` is ignored; `.env.example` is the committed template. The Expo CLI loads it
before it evaluates `app.config.ts`, so one file feeds both halves:

- `app.config.ts` passes `backendURL` to the config plugin, which writes
  `com.c15t.backend.url` / `com.c15t.backend.mode` into `ios/Info.plist` and
  `com.c15t.PORTAL_URL` into `AndroidManifest.xml` at prebuild time.
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

Advanced self-hosted deployments use the same transport contract. Keep the native
and JavaScript URLs equal and export the resource from that deployment's manifest.

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
[packed consumer guide](../../../docs/internal/expo-packed-consumer.md) for the
options, exclusive routing and clean external-consumer checks.

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
ios/c15tExpoDev/Info.plist              com.c15t.backend.url, com.c15t.backend.mode
ios/c15tExpoDev/Info.plist              NSUserTrackingUsageDescription, NSUserTrackingMarkdownUsageDescription
ios/.../Supporting/de.lproj/InfoPlist.strings   NSUserTrackingMarkdownUsageDescription
android/.../AndroidManifest.xml         <meta-data android:name="com.c15t.PORTAL_URL" ...>
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
