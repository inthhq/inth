---
title: Native consent UI prototype
description: Run the private SwiftUI and Compose consent screens with the native consent core.
---

The optional `InthConsentUI` SwiftPM product and `inth-consent-ui` Android
module provide the first native consent-screen prototype. They use the same
native engine as SDK gates. The core and platform modules remain headless.
This milestone does not establish production support or TCF certification.

## Run the reference apps

Start with an example Inth project. Configure its policy and permitted app
origins, then enter its HTTPS backend URL and your app's privacy-policy URL in
the demo's connection screen. The designated example is `https://example-inth.inth.app/`. Its init response uses
the current policy contract when native contract and version headers are present. Only init has been probed; this prototype has not
verified live hosted receipts. No credential or substitute customer binding is included.

The apps live in `examples/native/consent-demo`. The iOS app also accepts build
settings `C15T_BACKEND_URL` and `C15T_PRIVACY_POLICY_URL`. Android currently takes
both URLs through its connection screen. These public configuration values do
not replace backend policy authoring.

For iOS, install Xcode and XcodeGen, then run `xcodegen generate` from
`examples/native/consent-demo/ios`. Open `InthConsentDemo.xcodeproj` and run the
`InthConsentDemo` scheme on an iOS Simulator. The candidate deployment floor is
iOS 16.4. For Android, install JDK 17 and Android SDK 36, then run
`./gradlew :consent-demo:installDebug` from `packages/android`. Launch the
`com.inth.prototype.consent` app on an emulator. The candidate floor is API 24.
Current simulator and emulator runs do not validate either minimum OS.

## Attach the optional UI

Each platform has a one-call entry point that attaches to the installed core
through a shared `ConsentPrompt`, one per core. The prompt holds a single
presenter, so every scene, Activity or composable that attaches shares one open
session and one draft. Only one attached host draws it: the first, or a
foreground host when the one drawing it goes to the background. With
`autoPresent` on, the default, the presenter opens an owed prompt once the core
is ready, once per owed prompt. `ConsentPrompt.onFinished` reports each closed
session with its outcome, which is where a follow-up step such as Apple's
tracking request attaches.

On Apple platforms, apply `.c15tConsent(configuration, privacyPolicyURL:)` to the
SwiftUI root, or make `ConsentRootViewController` the UIKit window root. Both
install the engine on first appearance and retry after protected data becomes
available. `.c15tConsent(privacyPolicyURL:)` attaches to a core the app
installed itself. Call `ConsentPrompt.current?.presentPreferences()` from the
app's standing Privacy settings entry. An app that needs its own presenter
lifetime can still keep a `ConsentPresenter(core:)` and apply
`c15tConsent(presenter:privacyPolicyURL:)`, as
`ios/Sources/consent-demo-app.swift` does.

On Android, install with `InthAndroid.install`, then place
`InthConsent(privacyPolicyUrl = ...)` beside the host's Compose content, or call
`attachConsent(privacyPolicyUrl)` from an Activity after `setContentView`. Call
`ConsentPrompt.of(core).presentPreferences()` from Privacy settings. An app that
retains its own `ConsentPresenter` can still render
`InthConsent(presenter, privacyPolicyUrl)`, as
`android/src/main/kotlin/com/inth/demo/consent-demo-activity.kt` does.

Both presenters own drafts, search, navigation and native commits. Accept all
and Reject all call core intents. Save choices submits the displayed draft with
its revision. UI callbacks report `saved` only after durable local success;
backend delivery can remain pending. `dismissed` records no decision. Android
Back closes only the SDK presenter and keeps the host activity in the foreground.
The first layer is a full-screen page on both platforms; Customize pushes
settings inside it and Back returns to the first layer. Standing preferences
opened from the host are a large sheet on iOS with Cancel. Dirty preferences
require an explicit discard. A pending action locks edits and navigation.

A failed write keeps the draft open. A competing decision produces a stale-draft
message and an action to load current settings. Necessary and restricted
categories use status text. LI controls read native draft values and never
start enabled in the presenter. The read-only `iabPresentation()` projection
captures the scoped partner disclosure and draft together; native gates share
the publisher-restriction rules. An unavailable or expired list blocks new
optional IAB grants while Reject all remains available.

The UI uses native SwiftUI and Material 3 controls. It includes category
preferences, IAB purpose and special-feature choices, partner search/details,
Additional Consent partner search and choices, required privacy-policy links,
notice acknowledgement and standing withdrawal. Accept and Reject share the
same style and dimensions. Stock copy is English in this prototype.

## Privacy Settings rows

Every row of Privacy Settings is one pattern: a symbol, the standard name and a
note, with the control at the trailing edge. Tapping the name opens the rest in
place. A purpose's note is its partner counts, one per line, so they are on the
collapsed row and not behind the details. Its details hold the user-friendly
text, the legal text, the standard illustrations, the link to its partners and
the legitimate-interest switch. Special purposes and features use the same row
with no control. The legitimate-interest explanation sits under the purposes
it applies to. Symbols are chosen by vendor-list id and only label a row; at
accessibility text sizes they are dropped.

The footer holds Reject All and Accept All as equal tonal buttons, Save
Settings as the one filled button, and the provider tag.
By default Save is a short button in the navigation bar and only the twins
are in the footer; `ConsentTheme.savePlacement = bottom` puts the filled Save
Settings button under them. Accessibility text sizes keep Save at the bottom.

## Appearance

`ConsentTheme.firstLayer` chooses the first choice's container: `page` (the
default), `sheet` (a floating sheet over the dimmed app) or `prompt` (a centred,
translucent card like a system permission alert). All three draw the same first
layer: the same sentences, partner link, summary lines and equal decisions, with
the decisions in a row of their own under the text so nothing scrolls behind
them. From the first accessibility text size every layout is the page, and so is an
IAB TCF choice in a wide window (regular width or a phone in landscape on iOS, 600dp on Android), where
a card would cover a fraction of the screen. On a card, Reject all and Accept
all are an opaque tint of the surface with the text colour, or black or white
where the text colour would fall under 5:1; they ignore the `buttonPrimary` slot.
`ConsentTheme.appearance` chooses the stock colours: `system`, the default, for
the platform's backgrounds and labels with the app's accent, or `c15t`. The sheet and prompt
always take the system colours. With them the app's own name and icon each stand in for a
brand name or mark the theme does not set, the system page shows a symbol beside each summary
line, and the decision fill is the accent darkened until white text on it reaches
5:1. The rest of this section describes the `c15t` page.

The first choice is a full-screen page, not a sheet. It cannot be swiped away,
so it does not look like something that can be. Customize pushes category and
partner settings inside that page; Back returns to the first choice without
recording anything. Standing settings opened later from the host's own Privacy
entry are a large sheet on iOS and a full-screen window with Close on Android,
because by then the app behind them belongs to the user.

The `c15t` appearance is warm paper (`#F8F4EE` light, `#171411` dark), ink text,
the platform system typeface, and Inth blue only for links, switches and Save.
Headlines use San Francisco on iOS and the system sans serif on Android; a host
can still opt into a different headline face.
Accept all and Reject all are twins: the same fill, size and weight, side by
side when both labels fit and stacked at accessibility text sizes. Customize is
outlined. Dark mode flips the paper
and ink; every colour carries a light and a dark value.

Below the accessibility text sizes the decisions are a pinned footer. From the
first accessibility size on iOS (`isAccessibilitySize`) and font scale 1.5 on
Android, three stacked buttons and a failure row would take most of a short
window and need a scroll of their own, so the structure changes and the type
does not: the first layer has no footer, and Reject all, Accept all, Customize
and the provider tag follow the text in the one scrolling page. Preferences keep
one compact pinned action, Save, or Load current settings for a stale draft, or
Reject all while policy is pending, and put Reject all and Accept all in the
page straight after the introduction, equal and stacked. A failure row sits
beside the control that failed: above the shortcuts, or as the page's last row
above the pinned Save, and the page scrolls to it. `ConsentPresenter.failedAction`
names that control. The trigger is the platform's own size class rather than a
measured height, because a layout that changed structure the moment a failure
row appeared would move the actions under the thumb. The footer is never a
scroll view of its own at any size. The demo journeys hold this on an iPhone SE
and a 360x640dp emulator at the largest supported sizes, reaching every control
by scrolling the page. The headline wraps
balanced on both platforms, so a two-line stock or host headline breaks near its
middle instead of leaving one word on the last line; no line break is written
into the copy. Partner list, partner detail and Additional Consent pages share
the same canvas as the first choice and preferences.

While a choice is being saved, the pressed button keeps its label and shows a
spinner beside it after 400 ms; the other actions dim until the durable write
finishes. The spinner never replaces a label, so the person can still see which
decision is being recorded. `ConsentPresenter.pendingAction` names that action
for hosts that render their own controls.

A refused durable write keeps the draft and shows one quiet row above the
actions: a red glyph, the message in the text colour, and Try again in the
accent at the end of the same sentence run, wrapping like any other word. The
link is its own 44pt or 48dp control and its own accessibility element; the
paragraph itself never retries. It is not a filled card, so it does not
outrank the decisions it sits beside. The message names what failed, a save or a notice dismissal, and
says nothing changed on this device; Try again repeats the same intent. The row
stays while a retry is in flight, so nothing moves under the thumb, and clears
only on success or a reload. The presenter announces the failure once.

The Other ad partners page names the purposes Google's Additional Consent
depends on by the names shown under Purposes, never by number, and says when
they are off in the current draft, because the core then records every
provider as off.

Small text on tinted fills meets 4.5:1 in the stock theme. The On and Partly on
partner tags set their text in the accent pulled 30% toward the text colour,
derived from whatever accent and text a host supplies. The partner count inside
the first-layer summary card is a disclosure in the text colour with a chevron,
not a blue link, because the accent alone does not reach 4.5:1 on the muted
surface at that size.

The default header shows the selected provider's bundled logo, c15t or Inth,
without a background or border, aligned to the same left edge as the headline,
with "YOUR BRAND HERE" as the tracked accent eyebrow. It does not read the
app's display name or launcher icon.
`ConsentTheme.Brand` replaces the name, mark, or both with explicit app branding. An explicit mark that cannot
be loaded shows the label's initial instead of silently substituting a logo.
`Brand.hidden` (Swift) or `Brand.Hidden` (Kotlin) starts the page at the headline.
Standing preferences show one category group with no heading outside IAB; IAB keeps its "This app",
"Purposes", "Special features" and partner groups. On preferences, Accept all
and Reject all are equal outlined buttons and Save is the one filled action,
and the footer shares the cards' 16pt edges; the first layer keeps its 24pt
page margin. List rows rely on the platform's own cell insets with a 44pt
minimum target, and on iOS 17 and later sections sit 24pt apart.

`ConsentTheme` (Swift, `InthConsentUI`) and `com.inth.consentui.ConsentTheme`
(Kotlin) are the one customization surface. Names with a web token follow
`--inth-*` in `@inth/sdk/ui`. Each holds nine semantic colours (`canvas`,
`surface`, `surfaceMuted`, `text`, `textMuted`, `primary`, `textOnPrimary`,
`decision`, `textOnDecision`), radii (`sm`, `md`, `lg`), spacing (`xs` to `xl`),
typography (`fontFamily`, `fontSize` `sm`/`base`/`lg`, and the headline
typeface: `serif`, `sansSerif`, `rounded` on Apple, or a bundled font), four
slots (`consentBannerTitle`, `consentBannerDescription`, `buttonPrimary`,
`buttonSecondary`) with `color`, `backgroundColor`, `borderRadius` and
`fontSize`, a brand name and
mark, the headline and introduction copy, and the provider name and logo in the
"Secured by" tag. The tag shows the bundled Inth wordmark by default, centred under the actions. Decision labels, category copy and every partner disclosure stay native
and are not themeable: the theme cannot make Accept louder than Reject, hide a
decision, or change what a choice means.

Set a process default, add app-binary overrides, or pass a theme for one presenter.
App-binary keys override `ConsentTheme.current`. An explicit `theme` argument
takes precedence over both and uses exactly the values passed by the host.

```swift
// 1. Set once at launch; every presenter that does not pass a theme uses it.
ConsentTheme.current = ConsentTheme(
    colors: .inth, radius: .init(md: 10), typography: .init(headlineFont: .rounded),
    brand: ConsentTheme.Brand(name: "Pantry", markImageName: "ConsentDemoMark"),
    copy: ConsentTheme.Copy(headline: "Before you shop.", introduction: "Pantry uses data to remember your basket, measure what works and show offers you might like."))

// 2. Pass one to the root modifier.
content.c15tConsent(presenter: presenter, privacyPolicyURL: policyURL, theme: PantryBrand.theme)
```

```kotlin
// 1. Set once in Application.onCreate.
ConsentTheme.current = ConsentTheme(
    colors = ConsentTheme.Colors.inth.copy(primary = ConsentThemeColor(0x00796B, 0x4FD1C0)),
    brand = ConsentTheme.Brand(name = "Pantry", markResId = R.drawable.consent_demo_mark))

// 2. Pass one to the composable.
InthConsent(presenter, policyUrl, theme = PantryBrand.theme)
```

3. Declare values in the app binary. iOS reads `Info.plist` keys and Android reads
application `<meta-data>`; both apply over `current`, so a build flavour can
restyle an app without code. Colours are `#RRGGBB` or `#RRGGBB,#RRGGBB` (light,
dark). Android also accepts colour, drawable and font resources.

| Info.plist | Android meta-data | Value |
| --- | --- | --- |
| `com.inth.consent.primary` | `com.inth.consent.PRIMARY` | colour |
| `com.inth.consent.textOnPrimary` | `com.inth.consent.TEXT_ON_PRIMARY` | colour |
| `com.inth.consent.canvas` | `com.inth.consent.CANVAS` | colour |
| `com.inth.consent.surface` | `com.inth.consent.SURFACE` | colour |
| `com.inth.consent.surfaceMuted` | `com.inth.consent.SURFACE_MUTED` | colour |
| `com.inth.consent.text` | `com.inth.consent.TEXT` | colour |
| `com.inth.consent.textMuted` | `com.inth.consent.TEXT_MUTED` | colour |
| `com.inth.consent.decision` | `com.inth.consent.DECISION` | colour |
| `com.inth.consent.textOnDecision` | `com.inth.consent.TEXT_ON_DECISION` | colour |
| `com.inth.consent.radiusSm`, `radiusMd`, `radiusLg` | `com.inth.consent.RADIUS_SM`, `RADIUS_MD`, `RADIUS_LG` | points or dp |
| `com.inth.consent.spaceXs` to `spaceXl` | `com.inth.consent.SPACE_XS` to `SPACE_XL` | points or dp |
| `com.inth.consent.fontSizeSm`, `fontSizeBase`, `fontSizeLg` | `com.inth.consent.FONT_SIZE_SM`, `FONT_SIZE_BASE`, `FONT_SIZE_LG` | points or sp |
| `com.inth.consent.fontFamily` | `com.inth.consent.FONT_FAMILY` | PostScript name or font resource |
| `com.inth.consent.<slot>.<field>` | `com.inth.consent.<SLOT>_<FIELD>` | slot colour or size |
| `com.inth.consent.headlineFont` | `com.inth.consent.HEADLINE_FONT` | `serif`, `sans`, `rounded`, or a font |
| `com.inth.consent.brand` | `com.inth.consent.BRAND` | Boolean, show or hide the app identity above the headline |
| `com.inth.consent.brandName` | `com.inth.consent.BRAND_NAME` | text |
| `com.inth.consent.brandMark` | `com.inth.consent.BRAND_MARK` | asset name or drawable |
| `com.inth.consent.headline` | `com.inth.consent.HEADLINE` | text |
| `com.inth.consent.introduction` | `com.inth.consent.INTRODUCTION` | text |
| `com.inth.consent.branding` | `com.inth.consent.BRANDING` | Boolean, show or hide the provider tag |
| `com.inth.consent.brandingProvider` | `com.inth.consent.BRANDING_PROVIDER` | `c15t` or `inth`; `consent` also selects Inth |
| `com.inth.consent.brandingName` | `com.inth.consent.BRANDING_NAME` | custom provider name |
| `com.inth.consent.brandingMark` | `com.inth.consent.BRANDING_MARK` | custom provider asset name or drawable |

The provider tag stays separate from the header. The selected provider also
supplies the default header logo; explicit app branding overrides that header.
Use `branding: .inth` in Swift or `branding = ConsentTheme.Branding.Inth` in
Kotlin to show the bundled Inth logo and name. Both built-in logos are compiled
vectors, so they render at first launch without downloading an image.

```swift
ConsentTheme.current = ConsentTheme(branding: .inth)
// A different provider can supply an asset from the app's catalogue.
ConsentTheme.current = ConsentTheme(branding: .custom(name: "Example", markImageName: "ExampleLogo"))
```

```kotlin
ConsentTheme.current = ConsentTheme(branding = ConsentTheme.Branding.Inth)
// A different provider can supply an app drawable.
ConsentTheme.current = ConsentTheme(branding = ConsentTheme.Branding.Custom(name = "Example", markResId = R.drawable.example_logo))
```

For binary configuration, set `brandingProvider` / `BRANDING_PROVIDER` to `c15t` for the previous mark; `inth` is the default.
For a custom provider, set `brandingName` / `BRANDING_NAME` and optionally
`brandingMark` / `BRANDING_MARK`. A custom name without a logo renders text only;
it never keeps an unrelated c15t or Inth logo. A custom name takes precedence
over a built-in provider in the same configuration. Unknown provider values
preserve the existing theme. `showsBranding = false`, or the existing Boolean
binary key, hides the whole tag. Its logo is decorative, and accessibility reads
one label, such as "Secured by Inth". The tag does not change any consent decision.

React Native hosts get the same screens through the installed native presenters,
so a bare app sets `ConsentTheme.current` in its `AppDelegate` or `Application`,
or declares the keys above in `Info.plist` and `AndroidManifest.xml`. The Expo
config plugin does not write these keys yet; an Expo app can set the iOS keys
through `ios.infoPlist` in `app.json` and needs its own small config plugin for
the Android meta-data. The JavaScript `theme` prop of the built-in React
components only styles the fake-core demo surfaces and does not reach the native
screens.

The demo apps carry a sample brand, `PantryBrand`, behind the debug fixture
switch `C15T_FIXTURE_THEME=brand` (an iOS launch environment value, an Android
intent extra). It changes the accent, decision fill, radius, headline face, mark
and copy, and the UI tests check that Accept and Reject stay the same size under
it.

## Deterministic app tests

Only debug builds accept `C15T_FIXTURE_SCENARIO`. iOS uses a launch environment
value; Android uses an intent extra. The current scenarios are
`fresh-online`, `fresh-online-iab`, `fresh-online-notice`, `fresh-offline-none`
and `gpc-on`. The in-process fixture supplies `/init` protocol responses to the real
`HostedTransport`; all decisions and durable writes still go through the real
native core. It deliberately refuses save delivery and writes the latest
request body to `last-save.json`. This is a controlled protocol peer, not proof
of a successful hosted receipt.

`C15T_FIXTURE_THEME=brand` applies the sample brand theme described under Appearance.
`C15T_FIXTURE_IDENTITY=generic` points the app mark at a missing asset to show the drawn
initial tile; `C15T_FIXTURE_IDENTITY=hidden` starts the page at the headline.
`C15T_FIXTURE_RESET=1` clears only the selected scenario's test storage.
`C15T_FIXTURE_OFFLINE=1` fails init while retaining that storage.
`C15T_FIXTURE_FAIL_NEXT_WRITE=1` arms a durable decision-write refusal after initial
hydration. On Apple platforms, policy-only startup refreshes do not consume
this test fault. Android uses Boolean extras for these switches. iOS debug fixtures also accept
`C15T_FIXTURE_APPEARANCE=dark` for reproducible native theme captures. Normal app launches
do not select fixtures or reset state.

XCUITest lives in `ios/UITests/consent-journey-tests.swift`. Run it with the
`InthConsentDemo` scheme and an explicit simulator destination. AndroidJUnitRunner
and Compose tests live in `android/src/androidTest`; build
`:consent-demo:assembleDebugAndroidTest`, install both APKs on a task-owned
emulator, then run `com.inth.prototype.consent.test/androidx.test.runner.AndroidJUnitRunner`.
Screens expose `Inth.*` accessibility identifiers and Compose resource IDs. The
subset app teams may rely on is listed in `packages/react-native/maestro/selectors.json`
and documented on the React Native E2E testing page;
`scripts/native-consent-selectors.test.ts` fails if one leaves either platform. These standalone tests do not replace the separate bare RN app
journeys or packed-consumer acceptance.

For the HTTP receipt journey, start the reviewed
`internals/fixtures/react-native-bare/scripts/e2e-backend.py --out <artifact-folder>`
on free loopback port 3000. Use a fresh backend per platform. Android also needs
`adb -s <owned-serial> reverse tcp:3000 tcp:3000`. The dedicated iOS
`ProtocolReceiptTests` and Android `realControlsDeliverNativeReceipts` test select
`C15T_FIXTURE_BACKEND=http://localhost:3000/api/self-host` explicitly. This override
is accepted only in debug fixture builds and only for exact loopback hosts. Each
host declares the four optional categories before loading the permissive policy.
The tests tap the real Reject all control and compare the core's recorded category
receipts and subject identity with the received `/subjects` body. iOS also checks
process-relaunch persistence; Android instrumentation checks activity relaunch.
A separate Android force-stop and cold launch with the backend stopped also
confirmed cached policy and the recorded rejection from the same receipt journey. The backend exports
`events.jsonl` and `native-state.json`. These tests prove local protocol delivery,
not delivery to the public Inth project. Without the test backend, that dedicated
test skips; the other native app journeys still run.

## React Native hosts

The private RN package includes the same SwiftUI and Compose presenters. The
bare RN and Expo examples use these screens when the native core is installed.
Their explicit fake mode retains the existing JavaScript demo. Headless hooks
and custom UI remain available.

`ConsentProvider` hands its `autoPresent` setting and URL to native with
`configureAutoPresent`, and the native `ConsentPrompt` presents the owed prompt
once per owed prompt, as it does for a Swift or Kotlin app. JavaScript keeps no
record of its own; it hears `onConsentPresenterPresented`,
`onConsentPresenterUnavailable` and `onConsentPresenterOutcome`. The native host
answers any racing call with `already-presented`. The bare RN and Expo fixtures pass
`autoPresent={false}` because they draw the JavaScript banner.

Subscribe with `onConsentPresenterOutcome` before calling
`presentConsentPrompt(privacyPolicyURL)` or `presentPreferences(privacyPolicyURL)`.
The HTTPS privacy-policy URL belongs to your app. A request returns
`{ sessionId, status }`. Status is `presented`, `already-presented`, or
`not-required`; the last has a null session ID. A repeated request preserves
its open draft. `closeConsentPresenter(sessionId)` ignores obsolete IDs,
requires native confirmation for a dirty draft and refuses close while saving.

Each finished session emits one compact `{ sessionId, kind, revision }` event.
`committed` means durable local storage succeeded, `acknowledged` means a
notice was durably dismissed, and `dismissed` records no decision. A definitive
no-match response uses the fallback choice prompt; its saved decisions emit
`committed`. `unavailable` means unresolved settings were closed without a
decision. Backend delivery may still be queued after a successful local commit.
Draft toggles, search and
navigation stay native. Native controls and gates continue while Hermes is
busy; JavaScript receives the final event when it resumes. Runtime teardown
removes its callback without undoing durable native work. A new Android runtime
can attach to an existing session, whose ViewModelStore survives host activity
recreation. If Android finishes the consent Activity while retaining the process,
a repeated request opens that session again with its existing draft. Outcomes are
runtime events, not a persisted event inbox.

Notice hosts leave the app visible and accept touches outside the native notice.
The UIKit adapter uses measured SwiftUI notice bounds; the Android adapter adds
a bottom-sized Compose view to the existing host Activity. Activity recreation
restores that notice and its native session without another presentation request,
including while JavaScript is busy. Saved state from an older session cannot
attach a newer notice to another Activity. Opening settings from the notice uses
the same native session. A notice acknowledgement grants nothing. If bundled
authority expires while settings are open, Reject remains available. A changed
revision still requires an explicit reload before a decision can save; Accept and Save
remain unavailable until policy refresh.

CocoaPods compiles generated copies of `InthCore`, `InthApple` and
`InthConsentUI` from the packed RN package. Regenerate with
`scripts/sync-vendored-core.ts` and `scripts/sync-vendored-apple.ts`; never edit
vendored sources. Android resolves versioned `inth-core`, `inth-android` and
`inth-consent-ui` binaries from the configured Maven repository. The Compose
module publishes Kotlin 2.1 metadata for the Expo 57 consumer. Installing the
RN binding includes UI code; native headless products do not depend on it.
Local staging does not authorize remote publication, and the RN package remains
private.

First-install offline policy uses the same installed core and the validated
build resource described in [mobile policy resources](../../../native-protocol/docs/mobile-policy-resources.md).
The resource carries no subject or grants, retains disclosure dates, and expires.
Optional gates deny before an explicit choice. The designated hosted example
and advanced transport APIs remain unchanged. Do not renew the demo resource's
source dates to make a test pass.

The Release app runner is
`bun run --cwd internals/fixtures/react-native-bare e2e:ios` or `e2e:android`.
It creates a fresh task-owned device, embeds a controlled policy resource, and
uses real native controls for offline accept/reject/custom save, cancellation,
withdrawal, process-death persistence and exact queued replay. Its IAB step
blocks Hermes deliberately while exercising native purpose, LI, partner search,
details and Additional Consent controls, then checks gates before JavaScript
resumes and one final event afterward. The journey also checks repeated requests,
obsolete close, backgrounding, Android recreation, notice pass-through and durable
notice acknowledgement. The runner preserves XCTest/JUnit
reports, recordings, screenshots and backend/native observations, including
failed runs. Set `C15T_APP_E2E_PORT` to a free host port and
`C15T_APP_E2E_OUT` to a new evidence directory. Android reverses device port
3000 only on the device the runner creates. This proves controlled local
protocol delivery, not hosted receipt acceptance.

Full validation calls the separate mobile app workflow. It does not participate
in publishing. Local app evidence does not establish physical-device,
minimum-OS, screen-reader, RTL, localization or TCF certification coverage.
Packed Expo runtime acceptance and host-specific gaps must be recorded in the
integration handoff alongside exact refs and captures.

## Advanced transport configuration

Self-hosted backends remain compatible through the existing native transport
APIs and the same policy and subject protocol. Custom `CoreConfig` and
`NativeConfig` integrations still own transport, protected storage and lifecycle
setup. Changing transports does not change the consent screens. See
[the mobile support contract](./mobile-support.md) for installation ownership
and the remaining first-release gates.
