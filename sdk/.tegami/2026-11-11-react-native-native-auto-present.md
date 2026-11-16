---
packages:
  '@c15t/react-native': minor
---

### Let the native prompt decide when the consent prompt opens

`ConsentProvider` no longer decides in JavaScript when a prompt is owed. It
hands its `autoPresent` setting and privacy-policy URL to the native
`ConsentPrompt` through a new `configureAutoPresent` bridge method, and the
native prompt presents exactly as it does in a Swift or Kotlin app. JavaScript
hears what is on screen through two new events, `onConsentPresenterPresented`
and `onConsentPresenterUnavailable`, beside `onConsentPresenterOutcome`.

What an app sees stays the same. Auto-present is on by default and
`autoPresent={false}` opts out. A prompt the person dismissed stays closed until
the requirement changes, and an app that opted out never sees a prompt it did
not ask for. A prompt owed while the app is in the background, before its window
or Activity is ready, or across `C15t.uninstall()` and a new install, opens once
the app is in the foreground. A React Native app and a native scene in the same
binary now share one prompt session.

This needs a new app binary. A JavaScript update on a binary built before this
version presents nothing by itself and logs one `console.error` asking for a
rebuild; `presentConsentPrompt` and `presentPreferences` keep working there.
