# SwiftUI consent example

A standalone iOS app using the local Swift package's public `C15tCore`,
`C15tApple` and `C15tConsentUI` products. Requires Xcode, XcodeGen and iOS 16.4
or later. It does not use React Native, Expo, CocoaPods or JavaScript.

From the repository root:

```sh
xcodegen generate --spec native/core-swift/Examples/swiftui-consent/project.yml
open native/core-swift/Examples/swiftui-consent/C15tSwiftUI.xcodeproj
```

Select the `C15tSwiftUI` scheme and an iOS simulator, then Run. The generated
project is ignored. Keep simulator code signing enabled so Keychain can pass
the installer's storage probe. The project uses ad-hoc simulator signing with no
developer account. To compile without launching:

```sh
xcodebuild build \
  -project native/core-swift/Examples/swiftui-consent/C15tSwiftUI.xcodeproj \
  -scheme C15tSwiftUI -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/c15t-swiftui-derived
```

To launch that build on a booted simulator you own, replace `SIMULATOR_UDID`:

```sh
xcrun simctl install SIMULATOR_UDID \
  /tmp/c15t-swiftui-derived/Build/Products/Debug-iphonesimulator/C15tSwiftUI.app
xcrun simctl launch SIMULATOR_UDID com.c15t.examples.swiftui
```

Append `--headless` to the launch command for the custom form. Terminate the
running app before changing launch arguments.

The default is a local opt-in demonstration. It stores choices and undelivered
records in the app's Keychain service. No backend is contacted. Accept, record a
sample event, then open Privacy settings and withdraw measurement. The event
button becomes unavailable. Relaunch to see the saved choice. Local consent
is durable; the sample transport never pretends to deliver a backend receipt.

The stock first layer uses the SDK's default theme. Its privacy link is a labeled
placeholder at `https://example.com/privacy`. This demonstration is not a
production policy or an IAB integration.

For the custom UI, add `--headless` to the scheme's Run arguments. Open Privacy
settings to edit a draft. Cancel discards it. This mode does not construct a stock
presenter and supports only category consent. It refuses IAB editing. Add
`--demo-unavailable` to try unavailable policy resolution, including relaunch
with a saved choice. A fresh app stays pending. Keychain can survive uninstall.
Use a fresh task-owned simulator for a fresh install; do not clear another app's
Keychain service.

For hosted consent, set `C15T_BACKEND_URL` to your public Inth project HTTPS URL
and `C15T_PRIVACY_POLICY_URL` to your app's HTTPS privacy policy in the app
target's build settings. Configure the backend policy before running. The
installer uses a separate hosted Keychain service. Invalid configuration fails
visibly and keeps measurement off. No credentials belong in this sample.

To run the tests on a simulator you own, replace `SIMULATOR_UDID` with its ID:

```sh
xcodebuild test \
  -project native/core-swift/Examples/swiftui-consent/C15tSwiftUI.xcodeproj \
  -scheme C15tSwiftUI -destination 'id=SIMULATOR_UDID' \
  -derivedDataPath /tmp/c15t-swiftui-tests \
  -resultBundlePath /tmp/c15t-swiftui-tests.xcresult \
  -parallel-testing-enabled NO -collect-test-diagnostics never
```

UI tests use a separate test Keychain service, reset only with the explicit test
launch arguments. They exercise the real app and stock screens. Unit tests
exercise gates, draft concurrency, refused writes, protected-storage retry and
teardown. They do not establish physical-device, VoiceOver, certification or
performance results.

The developer walkthrough lives in the canonical
[SwiftUI guide](../../../../docs/frameworks/react-native/swiftui.mdx).
