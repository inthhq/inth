---
packages:
  '@c15t/react-native': minor
---

### Test your app in Jest or Vitest with `@c15t/react-native/testing`

`createTestConsentClient()` from the new `@c15t/react-native/testing` entry
gives a test the real consent client over a fake native core, so a component
that uses the hooks renders in Jest or Vitest without the native module. Choose
the starting consent (`'unset'`, `'granted'`, `'denied'` or a category object),
read what the app committed from `commits`, change consent from the native side
with `setConsent()` and `setReady()`, and answer the simulated native prompt
with `prompt.acceptAll()`, `rejectAll()`, `save()`, `acknowledge()` or
`dismiss()`. The fake also serves `presentConsentPrompt()`,
`presentPreferences()` and auto-present, and refuses what the native cores
refuse.

`ConsentProvider` takes a `client` prop for the test client. A nested provider
still never presents the prompt.

Fixed: in Jest without `--experimental-vm-modules`, creating a consent client
in a development build left an unhandled rejection from the drift check's
dynamic import, which failed the test. The check is now skipped there.

With `jest-expo`, add `@c15t` to `transformIgnorePatterns`, because the package
ships ES modules. See "Test your app" in the React Native docs.
