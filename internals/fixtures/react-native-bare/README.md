# Inth React Native fixture (bare)

See the [mobile demo index](../../../packages/sdk/docs/frameworks/react-native/examples.mdx) for
current native modes, setup commands and the limits of IAB and hosted coverage.

A bare React Native 0.87.1 app on the New Architecture. Normal native mode runs
`src/native-presenter-app.tsx`, which requests the stock SwiftUI or Compose
presenter through the public package entry point. Privacy settings reopens the
native preference center, and the host displays presenter outcomes.

`INTH_FAKE_NATIVE=true` selects the older React shell and diagnostics with a
JavaScript fake. Its IAB drawer stores a display selection in React state, not a
native vendor commit. That shell is a UI fixture, not a production headless app.
The E2E runner's IAB mode instead installs a test CMP configuration in native
code before RN attaches. It does not prove typed RN IAB configuration.

The sections below retain historical fixture notes and runner details. Use the
mobile demo index for the current coverage boundaries; old run reports do not
verify a new SDK revision.

## Fixture code and historical exercises

- `ConsentProvider` and the protocol handshake against the Swift/Kotlin core in the
  binary, with the mismatch error surfaced on screen instead of a red box.
- The headless surface: `useSnapshot`, `useSaveConsents`, `useConsentActions`, `useInthBootstrap`,
  `useConsent`, `ConsentGate`, `ConsentReady`, `ConsentPrompt`.
- The built-in `ConsentBanner`, `ConsentDialog`, and `ConsentPreferences`.
- `useTrackingRequest`, the Apple tracking journey on the Privacy screen: the sheet, the
  centre that opens when the subject taps Additional Information, and the second sheet
  that follows while Marketing is still granted. The committed iOS project carries no
  `NSUserTrackingUsageDescription`, so the arm reads `unsupported` and the request
  rejects until you add one. See [Setup](#setup).
- Consent-gated loading, shown as a vendor component that mounts and unmounts and
  counts its own mounts, so a gate that opens early is visible rather than inferred.
- Persistence and the offline write queue, through the checklist below.
- A fake native core that samples `isAllowed` on a timer, so the gating path can be
  watched without a device, a backend, or a rebuild. See
  [Fake core](#fake-core).
- The `theme` prop and the light/dark/system control in the header, which is the only
  way to see both palettes without leaving the app: the surfaces resolve a scheme from
  `useColorScheme()` on their own, and a forced choice passes the stock theme with both
  appearances pinned to one palette instead of a theme this app invented.
- `safeAreaInsets` on `ConsentProvider`, measured from React Native core in
  `src/safe-area.ts`, so the surfaces and this app's own header lay out against the same
  bands and nothing lands under a clock or a home indicator.
- `inth-demo://` links, which is how a consent journey is run on a machine that cannot
  tap a screen. See [Drive it from a shell](#drive-it-from-a-shell).

Only the public package entry point is imported. There are no imports from
`packages/react-native/src`, so what breaks here breaks for a developer who installs
the package from the registry.

## Setup

```sh
bun install                        # from the repository root
cp .env.example .env
```

`.env` is ignored; `.env.example` is the committed template. `babel.config.js` loads
it and inlines every `process.env.INTH_*` read at build time, which is the only way a
value reaches a React Native bundle. A variable already in the real environment wins,
so `INTH_FAKE_NATIVE=true bun run android` overrides the file.

The app defaults to the public Inth demo, `https://example-inth.inth.app/`.
It embeds a native policy resource for fresh offline startup. The checked-in demo
resource expires on 5 November 2026. Re-export it before testing after that date.
See [mobile policy resources](../../../packages/native-protocol/docs/mobile-policy-resources.md)
for the export command, expiry semantics and native resource configuration.
No hosted save has been verified against the public demo.

Use your Inth project URL for your app. Update the JS environment value and
regenerate the resource when changing endpoints. Point the native core at it by editing the two files the core actually reads:

- `ios/InthBare/Info.plist` → `com.inth.backend.url`
- `android/app/src/main/AndroidManifest.xml` → `com.inth.BACKEND_URL`

There is no mode key. The mobile SDKs work only with Inth hosted projects, and both
platforms refuse any other host at launch. For a debug build against a staging or
loopback backend, also set `com.inth.dryRun` (iOS) and `com.inth.DRY_RUN` (Android);
that drops consent records, and a release build refuses it. An
absent key means "not configured", so leave a value out rather than setting it to an
empty string. `internals/fixtures/expo-dev` gets the same keys written by the config plugin.

There is no key to add. An Inth project is identified by its backend URL, and neither
`/init` nor `/subjects` carries a credential, so nothing here takes one.

To make the ads card ask Apple for anything, add `NSUserTrackingUsageDescription` to
`ios/InthBare/Info.plist` with a prompt App Review will accept. Add
`NSUserTrackingMarkdownUsageDescription` too if you want the expanded European Union
sheet, which iOS 27.2 draws in place of the plain one for a device inside the countries
Apple enabled. The plain key is not optional either way: Apple falls back to it on older
systems and outside those countries. Per-locale Markdown goes in
`<locale>.lproj/InfoPlist.strings`, not in the plist, which is what
[internals/fixtures/expo-dev](../expo-dev) has the config plugin write. Then set
`NSPrivacyTracking` to `true` in `ios/InthBare/PrivacyInfo.xcprivacy`. An app that asks
for the identifier is usually linking data across apps, and that key currently says it
does not. Leave it `false` only if you ask and then never track.

The deterministic native E2E lane uses a task-owned loopback backend on port 3108
and replaces only build artifacts. Its Release build reaches loopback through the
SDK's internal install API, which an app does not use. It does not change these
hosted defaults.

## Drive it from a shell

The app registers `inth-demo://`, so a consent journey is one command in and one
screenshot out. This exists because a Mac with no `Simulator.app` has no `simctl tap`, no
`idb`, and no Maestro, which means the iOS half of this fixture cannot be driven any other
way. Android takes the identical link through an intent filter, so a step written once
runs on both platforms.

```sh
xcrun simctl openurl <udid> inth-demo://accept
adb -s emulator-5554 shell am start -a android.intent.action.VIEW -d 'inth-demo://accept'

xcrun simctl io <udid> screenshot after-accept.png
adb -s emulator-5554 exec-out screencap -p > after-accept.png
```

iOS 26 does not hand a custom-scheme open to the app without asking. `simctl openurl`
raises "Open in “Inth Bare”?" and the journey waits there for that tap; in a Simulator
window with the keyboard attached, Return answers it. Where there is no finger for it, the
same link goes in as a launch variable. It enters through the launch options, so
JavaScript cannot tell it apart from a link the OS delivered, and the verbs are unchanged.

```sh
SIMCTL_CHILD_INTH_DEMO_LINK='inth-demo://accept' \
  xcrun simctl launch --terminate-running-process <udid> org.reactjs.native.example.InthBare
```

A valid stored or bundled policy lets these verbs operate offline. Without one,
the app waits for hosted `/init` before it can show a consent prompt. The native
E2E commands below start their own controlled backend and export their own resource.

The grammar is `inth-demo://<verb>[/<argument>][?name=value[&name=value]]`. Quote the URL
on Android: `?` and `&` belong to the shell otherwise.

| Verb | What it calls |
| --- | --- |
| `accept` | `saveConsents('all')`, every category the policy scope offers |
| `reject` | `saveConsents('none')`, strictly necessary only |
| `save?experience=1&marketing=0` | `saveConsents()` with one boolean per category named; unmentioned categories keep their receipts, and a `save` that names none writes experience on, marketing off |
| `dismiss` | closes any open sheet, then `dismissNotice()` |
| `customize` | opens `ConsentDialog`, the path the banner's Customize button takes |
| `preferences` | opens `ConsentPreferences`, with no prompt owed |
| `scheme/light`, `scheme/dark`, `scheme/system` | forces that palette on every surface, or gives the choice back to the platform |
| `identify?id=runner-42` | `identify()` |
| `logout` | `logout()` |
| `overrides?country=DE`, `overrides?country=` | `setOverrides()`, and an empty value clears it |
| `refresh` | `refresh()`: re-resolve policy and retry the offline queue |
| `reset` | see below |
| `help` | prints this list on screen |
| `report=1`, on any verb | answers on **Diagnostics**, so the receipt is in the same screenshot as the step that wrote it |

Every verb answers with one line, and the app prints it on **Diagnostics** under **Demo
links** next to the link it answered. A scripted run leaves behind a screenshot and
nothing else, so the receipt belongs in the frame that proves the step. A verb that does
not exist says so on screen, with the list, rather than doing nothing.

Which is what `report=1` is for. On iOS a link can only arrive at launch, and the tab the
receipt is printed on is app state, so the next launch wipes the receipt along with the tab.
A step that wants its receipt on screen has to ask for the tab in the same link:
`inth-demo://save?measurement=1&report=1`. Without the flag the answer exists only in the
JavaScript instance that the next step terminates.

Three things worth knowing:

- The table is `DEMO_VERBS` in `src/deep-links/verbs.ts`: one row per verb, and the row is
  the only place a verb is named, so the on-screen list and `help` cannot drift from it.
- `reset` is a row already, and reports that the installed package has no such action.
  When the SDK's reset consent action lands, wiring the verb is the one line that calls
  it, and the documentation, the list, and the receipt all come along.
- Android hands the launch link to JavaScript twice over a cold start, so an app answers a
  given link once per JavaScript instance. That also means a Metro reload replays the link
  that launched the app: kill it first when the next step starts from a clean run.

## Prove the iOS journey in one command

`scripts/ios-journey.sh` builds the fixture, erases a simulator so the subject has never
answered before, walks first run through a saved preference, a relaunch, the preference
centre and a reset in both colour schemes, and writes one numbered frame per step.

```sh
scripts/ios-journey.sh              # Release: the bundle is inside the binary
scripts/ios-journey.sh debug        # Debug: starts its own Metro, never on 8081
IOS_JOURNEY_ONLY=01-fresh-banner scripts/ios-journey.sh   # one step, for a re-run
```

Evidence lands in `IOS_JOURNEY_OUT`, which defaults to `/tmp/ios-journey`. `IOS_JOURNEY_SIM`,
`IOS_JOURNEY_DEVICE`, `IOS_JOURNEY_RUNTIME` and `IOS_JOURNEY_BACKEND` move the device and the
backend it talks to.

Without a usable stored or bundled policy, the core
resolves nothing and no prompt is ever owed, which looks exactly like a banner that never ships.

Four things it does that are easy to get wrong:

- It **erases the simulator** rather than reinstalling into one. `simctl uninstall` does not
  clear the Keychain, the consent snapshot lives in the Keychain, and so an app that was
  "freshly installed" is still a subject who already answered and never shows a prompt.
- It **keeps the ad-hoc signature**. Building a simulator binary with
  `CODE_SIGNING_ALLOWED=NO` produces an app whose Keychain writes fail: `/init` is a read,
  so the banner still renders, but every decision comes back
  `refused (queue-write-failed)`. Nothing else on screen says the signature is the cause.
- It builds **Release** by default, so the JavaScript bundle is inside the app. In Debug the
  binary dials a Metro server, and on a machine with several worktrees checked out that is
  whichever server started first, so Debug starts its own and probes upward from 8084.
- It sends links through `INTH_DEMO_LINK`, not `simctl openurl`. iOS asks
  "Open in “Inth Bare”?" before it hands a custom-scheme open to the app, and a headless
  run has no finger for it. One link per cold start also means every step survives process
  death on its own. Set `IOS_JOURNEY_PROBE_OPENURL=1` to re-test that claim rather than
  repeat it.

The evidence is not only pictures. Each step records the md5 of the whole frame and the md5 of
the frame below the system status band, plus the percentage of the app area that changed since
the previous step. Hashing the whole PNG is not enough on its own: the status bar carries a
clock, so a step that never happened still produced a fresh hash, and that is how an earlier
run reported eight steps while delivering none of them. Whether a consent surface is actually
on screen is read off the pixels by `ios-surface-metrics.py` rather than assumed from a verb
that exited 0. A receipt that reads `queued` is correct and expected: the core applies a commit
to the device durably and tells the backend afterwards, so no synchronous answer can promise
the server has it.


## Prove the Android journey in one command

`scripts/android-journey.sh` walks the same route on a connected device or emulator. It clears
the app with `pm clear`, sends each verb as a real `inth-demo://` deep link, and asserts the
outcome out of the view hierarchy rather than off a screenshot, so a step fails on the exact
word it did not find.

```sh
ANDROID_SERIAL=emulator-5554 scripts/android-journey.sh
```

It refuses to run with more than one device attached until `ANDROID_SERIAL` says which one, and
it takes a lock per serial, because two runs driving one device read each other's screens and
one of them reports a step that never happened. Frames and the hierarchies behind them land in
`JOURNEY_OUT`, which defaults to `/tmp/android-journey/<worktree>`.

The geometry half of that proof is `scripts/android-surface-metrics.py`, which the journey
runs for the banner and the consent manager:

```sh
ANDROID_SERIAL=emulator-5554 scripts/android-surface-metrics.py --mode dialog
```

It reads the two bands rather than assuming them, which is the part that is easy to get
wrong. The status band comes out of the dump, because with no host measurement the SDK takes
it from `StatusBar.currentHeight`, which is the status bar window the system reports. The
bottom band defaults to the SDK's `RESERVED_BOTTOM_INSET` floor and not to this device's
navigation bar, because the bare example passes no insets to the provider; wire
`react-native-safe-area-context` into the provider and pass `--nav-inset` with the device's
real number instead. Both bands are printed on every run, and a run that cannot read them
exits 2 rather than measuring against a guess. A saved hierarchy grades too, so the evidence
stays re-runnable after the device is gone:

```sh
ANDROID_SERIAL=emulator-5554 scripts/android-surface-metrics.py --mode dialog \
    --from-xml /tmp/android-journey/v3-3/02-customize-dialog.xml
```

To confirm a decision reached the backend rather than only the device, read the consent table
the demo writes to:

```sh
psql "$DATABASE_URL" -c 'select "givenAt", jurisdiction, "uiSource", "consentAction", "purposeIds" from consent order by "givenAt" desc limit 5;'
```

A `custom` action from `banner` naming exactly the purposes you switched on is the receipt.
`saveConsents('all')` records `accept_all` with every purpose, and a dismissal records nothing at all,
because a dismissal is not a choice.

The registration lives in three files, and all three are needed. `CFBundleURLTypes` in
`ios/InthBare/Info.plist` and the intent filter in `AndroidManifest.xml` are what make
iOS and Android deliver the link at all, and `AppDelegate.swift` forwards it to
`RCTLinkingManager`, which is what puts it in front of `Linking`. Drop the forward and the
OS accepts the URL while the app stays silent, which looks exactly like a broken verb.

To get back to a first-install prompt:

```sh
adb uninstall com.inth.bare                                          # Android: enough
xcrun simctl uninstall <udid> org.reactjs.native.example.InthBare     # iOS: not enough
xcrun simctl erase <task-owned-udid>                                  # destroys this simulator's data
```

Uninstalling is not enough on iOS. The core keeps the subject id and the stored envelope in
the Keychain, and Keychain items outlive an app uninstall, so a reinstall comes back as a
returning user holding the previous decision and no prompt is owed. Use a simulator that has
never run the build. Erase only a disposable simulator you own. Android keeps both in app-private storage, so
`adb uninstall` really does give a clean install.

## Commands

Run them from this directory, or from the root with `bun run --cwd internals/fixtures/react-native-bare <script>`.

| Command | What it does |
| --- | --- |
| `bun run start` | Metro. `start:reset` adds `--reset-cache` |
| `bun run pod-install` | `pod install` for `ios/` |
| `bun run ios` / `bun run android` | Build and launch |
| `bun run bundle` | Release bundle for both platforms into `.artifacts/` |
| `bun run test` | Vitest over `src/`, which is the demo-link grammar and the verb table |
| `bun run check-types` | `tsc --noEmit` |
| `bun run lint` / `bun run fmt` | Oxlint and Oxfmt, from the repo presets |

The native build setup is maintained in each platform directory.

- iOS: the first run needs `bun run pod-install`. The autolinked `InthReactNative`
  pod compiles its generated Swift core and Apple services. Do not add a separate
  `InthCore` pod. The deployment target is 16.4.
- Android: the host resolves versioned `com.inth` artifacts from its configured
  exclusive Maven repository. `settings.gradle` does not include the native
  producer or substitute its source. Set `INTH_MAVEN_URL` to an available private
  repository or explicit local staging URL; HTTPS resolution also needs the
  build environment's credentials. JDK 17 and the SDK levels in `android/build.gradle`
  are required. Set `ANDROID_HOME` or `sdk.dir` in `android/local.properties`.

`xcode-select -p` points at `/Applications/Xcode.app/Contents/Developer` here, so no
`DEVELOPER_DIR` override is needed for `pod install` or `xcodebuild`. Where it points at
Command Line Tools instead, CocoaPods reads an empty `xcodebuild -version`, and every Xcode
invocation needs `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.

## Historical native build status

Verified here: `bun run check-types` is clean, `bun run bundle` writes a release bundle
for both platforms, `pod install` completes, and the Android app gets through Gradle
configuration. Both platforms have been built, installed and launched;
[Historical device run](#historical-device-run) says what each one proved and what it still cannot.

iOS resolves. `pod install` from `ios/` prints:

```console
Auto-linking React Native module for target `InthBare`: InthReactNative
Pod installation complete! There are 88 dependencies from the Podfile and 87 total pods installed.
```

with `InthCore` and `InthReactNative` both at 3.0.0-alpha.1, so the podspec, the `Inth`
TurboModule codegen, and the local core path all hold. Nothing is scoped away to get that:
the Podfile calls `use_native_modules!` with no arguments and so runs the same unscoped
`react-native config` a Gradle build would.

Android configures, which is the half that used to fail. `autolinkLibrariesFromCommand()` in
`settings.gradle` runs an unscoped `react-native config`, so it is the check that a package's
autolinking metadata is usable at all:

```console
$ npx react-native config --platform android
  "@inth/react-native": {
      "sourceDir": ".../node_modules/@inth/react-native/android/inth-react-native",
      "packageImportPath": "import com.inth.reactnative.InthReactNativePackage;",

$ cd android && sh ./gradlew :app:mergeDebugResources --console=plain
BUILD SUCCESSFUL in 28s
```

Before the fix in [packages/react-native](../../../packages/react-native/android#autolinking),
the first command exited 1 with `Failed to build the app: No package name found`, and with it
this app's Gradle configuration died before compiling a single file; `pod install` only worked
because the Podfile passed an iOS-scoped autolink command around it. Both workarounds are gone.
`bun run check:react-native-autolink` re-runs that first command from this app's own install,
and the mobile SDK CI group runs it.

Two warnings from that `pod install` belong to the package too.
`InthReactNative.podspec` declares `license => '../../LICENSE.md'`, which is this
repository's root license and exists two directories above the package only in a
checkout, not in a consumer's `node_modules`. And React Native notes that calling
`pod install` directly is deprecated in favour of its own build integration.

Two more notes for anyone building natively from a checkout:

- `@react-native/gradle-plugin` is a devDependency of this app on purpose. The template
  includes it at the literal path `../node_modules/@react-native/gradle-plugin`, and Bun's
  isolated install layout does not link a package that only `react-native` depends on into
  this directory, so the `includeBuild` would not resolve.

## Historical device run

iPhone 17 Pro on iOS 26.4, built by `xcodebuild` against `InthBare.xcworkspace`, installed
with `simctl`, talking to `apps/playground` serving `@c15t/backend` at
`http://localhost:3000/api/self-host`. The app came up on the native core: the CORE panel
read `native (TurboModule)`, the handshake reported protocol 1, and the banner rendered with
copy from the backend, so `bootstrap()`, `snapshot()` and the subscription pump all held over
the real bridge rather than only against the fake.

Two things were only visible on a device. The banner's controls sat under the home indicator
and a sheet's heading sat by the clock, which is what the inset work in the package fixed.
The fixture's own chrome wanted the same treatment and now has it: the header pads itself by
the bands `src/safe-area.ts` measures (`StatusBar.currentHeight` on Android,
`StatusBarManager.HEIGHT` on iOS, a documented floor beneath both), and the tab bar clears
the clock on either platform with a banner on screen.

What this machine cannot do is drive a tap. It has both iOS runtimes and `simctl`, but no
`Simulator.app` anywhere in the Xcode bundle, so the device boots headless and can only be
observed through `simctl io screenshot`. Everything in the checklist that needs a finger
needs a machine with the full Xcode app, or a real device.

### Android

An API 36 `sdk_gphone64_arm64` emulator, `assembleDebug` from `android/` with the core
compiled from source through the `includeBuild` in `settings.gradle`, talking to the same
`apps/playground` backend over `adb reverse`. Unlike the iOS setup this one can be driven:
`adb shell input tap` at coordinates read out of `uiautomator dump`, which is how every
step in the checklist below was run. Process death is `am force-stop`, not a swipe.

The core came up native, and `no_backup/inth` holds `com.inth.snapshot` and
`com.inth.pending` as AES/GCM blobs. After a force-stop and relaunch the first frame
reported `stored snapshot: true`, `ready: true`, `policyPending: false` and the revision it
had before the kill, and the banner stayed dismissed.

Four defects were only visible here, and each is named in its own commit: Codegen output
written somewhere an app's build never looks, `accessibilityRole` carrying ARIA values
that Android's TalkBack enum rejects, subject ids in a shape the backend answers with
HTTP 400, and a caller-supplied GCM IV that AndroidKeyStore refuses on encrypt. The last
one is worth reading twice: `encrypt` had never once succeeded on a device, so no consent
ever reached disk, and the storage layer's silent answer to a non-key failure is what kept
it invisible. `ResilientKeyValueStore` now names that write out loud.

Re-running that journey on the current tree, after the kernel key-name fix and the change
that made a committed save owe its delivery, comes out the same with one thing missing from
the log. `installDebug`, `pm clear`, launch: CORE read `native (TurboModule)`, the snapshot
carried a fresh `sub_` subject at `ready: true` and `activeUI: banner`, and the
`ConsentClient` key-name warning did not appear at all, which is the whole claim of the fix.
One `input tap` on the banner's accept moved revision 2 to 3, left the subject id alone, and
put a `consent_given` audit row against that same id in the backend. `am force-stop` and a
relaunch came back at `stored snapshot: true` on the same subject, banner still dismissed,
and no second write arrived over the next minute.

One trap is worth naming because it looks like a contract break and is not. Metro serves the
current JavaScript while the installed APK carries whichever Kotlin was compiled when it was
last built, so a stale binary against a live bundle reads as the two cores disagreeing: the
`ConsentClient` warning fires with a dozen "the kernel owns these key names" lines while both
sides of the tree agree with each other. Rebuild with `sh gradlew installDebug` in `android/`.
A JavaScript reload will not clear it, and the warning will keep firing.

## Fake core

The example ships an in-JavaScript fake core (`src/inth/fake-native.ts`) built only on
`createConsentClient(module, events)` and `ConsentClientContext`, which is how the
package says to inject a mock. It implements the same TurboModule surface: hydrate and
init on timers, a 1 Hz `isAllowed` sampler whose recent samples print on screen, a
drift timer that flips one permission every few seconds so a subscription has
something to react to, a pending-write queue capped at 20 that refuses to send while
the online toggle is off, and a restart that rebuilds the client from stored state.

It is a fixture, not a second implementation. A green run in fake mode proves the
JavaScript side: subscription counts, gating, prompt requirements, the offline queue.
It proves nothing about Swift, Kotlin, Keychain, AndroidKeyStore, or Codegen, and the
app says so on screen whenever it is active: a `Fake core` badge under the header, and the
CORE panel on **Diagnostics** reading `fake stub, not a device core`, so a result cannot be
misread. The real core is the default; `INTH_FAKE_NATIVE=true` forces the fake, and a
binary without the module offers it as the way past the build error.

## Persistence and cold-start checklist

Run against the real core on a device or simulator. Do it with a backend you can
stop, or the offline steps just look like latency.

Steps 3 to 5 passed on iOS, run headless with the backend stopped and the app relaunched:
the first frame carried `ready: true`, `policyPending: false`, a non-zero `revision`, and an
`evaluatedAt` about an hour old. The stale timestamp is the proof that it was stored state,
not a response that happened to be quick.

The cached-snapshot steps and the queued-save steps below passed on Android, driven over
`adb` with the backend stopped and restarted between them. An accept committed while the
backend was down grew `com.inth.pending` from 44 to 1612 bytes, which is the payload on
disk rather than a promise in memory; after a force-stop and a relaunch with the backend
back up, the queue drained to its empty 44 bytes and the backend held exactly one
`accept_all` row for that install's new `sub_` subject, carrying the five purposes the
policy offered. Judged from the backend, as step 6 asks.

Cached snapshot before any network:

1. Load the app, accept all, wait for the revision to settle.
2. Kill the app by swiping it away, not by reloading from the dev menu. A reload keeps
   the process and proves nothing.
3. Turn on airplane mode, or stop the backend.
4. Relaunch. The first frame must already show the accepted permissions and a
   non-zero revision, with `ready: true` and `policyPending: false`.
5. Fail if the first frame is deny-all with `policyPending: true`, or if the
   permissions appear only after a visible delay: `snapshot()` is a synchronous read
   of stored state and must not wait on the network.
6. In fake mode, press **Simulate cold start** instead of killing the app. It rebuilds
   the client under a fresh React key, which is what a relaunch does to the
   JavaScript side. **Wipe storage (uninstall)** does the reinstall step below.

Queued save replayed on relaunch:

1. Start from a clean state: clear the app's storage, or press **Wipe storage
   (uninstall)** in fake mode.
2. Turn on airplane mode.
3. Accept all, or save a custom set. The action must report as queued, not failed.
4. Kill the app.
5. Turn the network back on and relaunch.
6. Pass when the backend has exactly one save record for that action, with the same
   category set that was chosen. Judge that from the backend rather than the revision:
   `revision` is local, it bumps on every committed mutation, and one bootstrap commits
   both a hydrate and a re-evaluate, so it moves past the stored number on an offline
   relaunch that saved nothing.
7. Fail when the record is missing, when the queue sent twice, or when the replayed
   body was rebuilt from the current policy instead of the payload that was queued.
8. Repeat with two actions queued back to back. Both must arrive, in order, unchanged.
   This fixture has no surface for it: once the banner is dismissed the Consent tab offers
   nothing that commits, and the preference centre needs the policy only a reachable
   backend can serve. The same assertion runs natively as
   `two payloads queued back to back fly oldest first, unchanged` in
   `packages/android`, which is where a queue that sends only the newest, or rebuilds a
   payload on the way out, gets caught.

Reinstall:

1. Delete the app, reinstall, launch. The subject id must be new, permissions must be
   deny-all with `policyPending: true` until the first init resolves, and no prompt
   may be owed that the policy does not ask for.

Handset detail that changes results: on Android, force-stopping and swiping away are
different. Use force-stop for a real process death.

## Native app E2E

Run from an installed checkout with Xcode and CocoaPods for iOS, or JDK 17,
Android SDK 37, NDK 27.1.12297006 and an API 36 system image for Android:

```sh
bun run --cwd internals/fixtures/react-native-bare e2e:ios
bun run --cwd internals/fixtures/react-native-bare e2e:android
```

To run the retained bundled-policy expiry scenario on either platform:

```sh
INTH_APP_E2E_SCENARIO=expiry INTH_APP_E2E_PORT=39883 \
  bun run --cwd internals/fixtures/react-native-bare e2e:ios
INTH_APP_E2E_SCENARIO=expiry INTH_APP_E2E_PORT=39884 \
  bun run --cwd internals/fixtures/react-native-bare e2e:android
```

This scenario uses a fixed fixture clock and a separate authored policy resource.
It accepts all four optional categories offline, restarts with only Necessary and
Measurement declared, advances to the exact bundle expiry, then opens the shared
native preferences. Accept and Save must be unavailable while Reject remains
usable. Reject must durably deny all four optional categories, including those
removed from the declaration. The test kills and relaunches the process, replays
the exact denial body, refreshes the same policy fingerprint, then widens the
declaration to prove earlier grants cannot return.

Android also has an adapter regression scenario:

```sh
INTH_APP_E2E_SCENARIO=adapter INTH_APP_E2E_PORT=39884 \
  bun run --cwd internals/fixtures/react-native-bare e2e:android
```

It opens a definitive no-match fallback through the native command and checks
one compact `committed` event with the returned session ID. It then blocks Hermes
for 30 seconds and forces a real host Activity recreation through a fixture-only
intent. The native notice must reattach and acknowledge while JS is blocked,
without a second presentation command. After JS resumes, exactly one correlated
`acknowledged` event must arrive and no additional consent receipt may be sent.
The IAB blocked-JS journey also correlates command and final event IDs.

The clock and declaration controls belong to the loopback E2E artifact. They use
the native installers' existing dependency injection. The normal app keeps the
system clock and hosted configuration. This does not test live hosted receipts.
The runner also checks captured raw delivery bodies, exact confirmation times
and the final fingerprint in `expiry-verification.json`. A failed receipt check
fails the E2E command. The E2E outcome observer subscribes for the lifetime of
the JS runtime so Activity recreation cannot interrupt its subscription.

These commands build Release apps with embedded JavaScript. XCUITest and
AndroidJUnitRunner with UIAutomator tap the stock consent controls. Each run
creates and deletes its own simulator or emulator. No shared device is erased.
Android's test APK runs in a separate process so it can force-stop the real app.

The test backend binds loopback port 39873 by default. Set
`INTH_APP_E2E_PORT` to an unused port for concurrent runs. It exports an authored conservative
manifest and serves the existing `packages/native-protocol/evaluation-eu-fresh-install.json`
response after reconnection. Only the E2E build artifact uses that endpoint and
resource. The checked-in reference defaults remain the public Inth demo.

`INTH_APP_E2E=1` embeds a fixture-only observer that publishes the real
TurboModule snapshot to the test backend. The test fails unless the active core
is native. It checks effective permissions, explicit category receipts, their
confirmation times and the actual `/subjects` bodies. The fake core cannot
satisfy these assertions. Demo links only reset scenarios. Reject, Accept,
Customize, category switches, Save and reopening preferences use visible controls.

The journey starts with a fresh installation and unavailable consent endpoints.
It verifies unknown country, no policy token, the bundled first prompt and denied
optional gates. Reject and Accept commit offline, then deliver their exact original
receipts on reconnect. A measurement-only choice and a cancelled draft survive
offline process death. Withdrawal denies immediately and survives another restart.
The final reconnect delivers that exact withdrawal, with no superseded grant or
duplicate accepted receipt. A second reconnect leaves exactly three deliveries.

Evidence defaults to `.artifacts/app-e2e/<platform>-<run>/`. It includes named
PNGs, an MP4 recording, native snapshots, captured delivery bodies, device logs,
build/test logs and a command XML report. iOS also retains the `.xcresult`, its
test summary and exported attachments. Android retains JUnit XML and UI hierarchy
XML. Failure cleanup captures the final frame and preserves available evidence.
Android records consecutive video segments and joins them so longer journeys
include the ending beyond screenrecord's time limit. It also uploads each capture to the test backend before APK teardown and
streams device logs while the test runs.
Successful runs require the scenario's named frames and a non-empty recording.
`command.xml` records runner failures, including compilation failures; it is not
a substitute for the native test report.

Set `INTH_APP_E2E_OUT` to a fresh absolute evidence directory. Optional device
settings are `INTH_IOS_RUNTIME`, `INTH_IOS_DEVICE`, `INTH_ANDROID_IMAGE` and
`INTH_ANDROID_ARCH`. Android defaults to an installed API 36 Google APIs arm64
image. CI uses x86_64. A run fails if its selected backend port is occupied. Run platforms
sequentially. `.github/workflows/mobile-app-e2e.yml` is callable and manually
dispatchable, and has no publication dependency.

### Real vendor SDKs

The E2E build starts the real PostHog, Mixpanel, Amplitude, Sentry Session Replay
and Firebase Analytics SDKs (`src/vendors/real-sdks.ts`) and connects each one
through the documented `connect*` helper. They send to the loopback backend,
which mounts `scripts/vendor_capture.py`; the keys and the Firebase project in
`GoogleService-Info.plist` and `google-services.json` are placeholders. Each
launch sends a startup probe before the prompt, and `fixture.vendor-probe` sends
another. A probe is one event through every SDK, then a flush.

The category journey checks five steps against `/captured`: a fresh install and a
refusal send no user data, a measurement grant delivers the probe event (Sentry:
replay segments), a withdrawal stops every vendor after in-flight uploads settle,
and a relaunch keeps the refusal. Firebase cannot be redirected, so
`scripts/verify-vendor-firebase.py` checks collection state, `analytics_storage`
and the probe event against Firebase's own log. Evidence lands in
`vendor-steps.jsonl`, `vendor-probes.json`, `vendor-requests.json` and
`vendor-firebase.json`.

On Android, Mixpanel sends to the emulator host alias `10.0.2.2`: its SDK treats a
host that resolves to loopback as ad-blocked and sends nothing. The iOS Podfile
links pods as dynamic frameworks because React Native Firebase requires it.

The main journey covers shared SwiftUI and Compose presenters, IAB and Additional
Consent controls, and a native commit while Hermes is blocked. The separate
expiry scenario covers the retained bundled policy boundary and narrowed
declarations. Storage refusal, Expo installation, standalone native apps,
physical devices and minimum supported OS versions need separate acceptance.

## Monorepo notes

Two things in `metro.config.js` are consequences of running an app inside a Bun
workspace, not SDK behaviour, and both are commented in the file:

- `watchFolders` has to include the repository root, because the real files behind
  the `@inth/react-native` symlink live outside the app directory. Without it Metro
  cannot see the package it is bundling.
- `extraNodeModules` points `@babel/runtime` at this app's copy. React Native's Babel
  preset rewrites every transformed file, the linked SDK included, to import helpers
  from `@babel/runtime`, and an isolated install layout hides the app's copy from a
  linked package. This does not apply to an app that installs from the registry.

No Jest, ESLint, or Prettier config came across from the RN template. The repository
runs Vitest, Oxlint, and Oxfmt.
