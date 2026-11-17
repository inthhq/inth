# Custom consent example

A standalone iOS app with one consent UI drawn entirely by the app. It is built
only from the headless blocks in `C15tConsentUI`: `ConsentDraft`,
`HeadlessConsentPrompt`, `HeadlessConsentPreferences`, `ConsentGate`,
`ConsentReady` and `ConsentActions`. The blocks decide when a prompt is owed and
supply the copy, the draft, the save and the accessibility. The look is the
app's own: a paper and ink palette, serif and monospace type, ruled rows and a
square switch. Requires Xcode, XcodeGen and iOS 16.4 or later.

| File | What it holds |
| --- | --- |
| `Sources/custom-consent-app.swift` | The app, its launch arguments and the local fixtures |
| `Sources/ledger-consent.swift` | The prompt, the preferences screen and the IAB TCF screens |
| `Sources/ledger-parts.swift` | Every colour, font and control the screens draw |

No backend is contacted. The app serves the consent demo's local `/init`
fixtures from `examples/native/consent-demo/fixtures`, and keeps choices in
memory, so every launch starts with no saved choice.

From the repository root:

```sh
xcodegen generate --spec packages/swift/Examples/custom-consent/project.yml
open packages/swift/Examples/custom-consent/C15tCustomConsent.xcodeproj
```

Select the `C15tCustomConsent` scheme and an iOS simulator, then Run. The
generated project is ignored.

## Launch arguments

The app opens on any screen with no taps. Add these to the scheme's Run
arguments, or to `xcrun simctl launch`:

| Argument | Effect |
| --- | --- |
| `--screen prompt` | The first layer. The default. |
| `--screen preferences` | The preferences screen. |
| `--screen iab` | The IAB TCF purposes. Uses the IAB fixture. |
| `--iab` | Serve the IAB TCF fixture instead of the category one. |
| `--stock` | Show the stock `C15tConsentUI` screens instead of the custom ones. |

```sh
xcrun simctl launch SIMULATOR_UDID com.c15t.examples.customconsent --iab --screen prompt
```

## Screenshots

`capture-screenshots.sh` builds the app, boots a simulator of its own and saves
the stock and the custom screens in light and dark:

```sh
bash packages/swift/Examples/custom-consent/capture-screenshots.sh /tmp/c15t-consent-screens
```

It writes 12 files named
`ios-<stock|custom>-<prompt|preferences|iab>-<light|dark>.png` and fails if one
is missing. The `ios-custom-consent` job in
`.github/workflows/mobile-app-e2e.yml` runs it and uploads the files as the
`custom-consent-ios-screenshots` artifact.

## IAB TCF

Under an IAB policy the screens must show everything the Transparency and
Consent Framework requires: the first layer's full text, every purpose with its
partner counts, a way to object to legitimate interest, each partner's
disclosures, and Additional Consent providers and custom partners in sections
of their own. The rows on `ConsentDraft.iab` carry all of it. This example
places every one of them.
