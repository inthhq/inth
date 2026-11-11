---
packages:
  '@c15t/react-native': minor
---

### Present the native consent prompt from `ConsentProvider`

`ConsentProvider` now presents the native consent prompt when one is owed, so
an app no longer writes its own effect around `presentConsentPrompt`. Pass your
privacy-policy URL:

```tsx
<ConsentProvider privacyPolicyURL="https://example.com/privacy">
	<App />
</ConsentProvider>
```

The provider waits until the native core is ready and the policy has resolved,
then presents once per owed prompt. A stored choice that is still valid shows
nothing. A new policy or an expired choice presents again. React strict mode,
remounts, nested providers and a manual `presentConsentPrompt` call never open
a second prompt.

The native snapshot now carries `promptOwedSince`, the revision at which the prompt
owed now became owed. The native presenters key their record on it, so the same prompt owed
again after an answer or a reset is presented even when the bridge delivered only
the latest snapshot. A binary built before this field reads it as `null` and keeps
the previous behaviour.

An owed prompt that meets open privacy settings is presented once
they close; a session that closes while the app has opted out is still heard; a
corrected privacy-policy URL is retried. A prompt the app opened with
`presentConsentPrompt` and the person dismissed stays dismissed when
auto-present is turned on later, and a prompt that opens after the provider
turned auto-present off is closed again without counting as dismissed. `presentConsentPrompt` and
`presentPreferences` answers now carry `presentation` (`prompt` or
`preferences`) for an open session, and the native host ends a session whose
notice was cleared elsewhere with a `dismissed` outcome.

This changes existing apps. `privacyPolicyURL` is now required unless you pass
`autoPresent={false}`. TypeScript names the missing `privacyPolicyURL`, and the
provider throws on render for a missing URL or one a native presenter would
refuse: it must be an absolute `https://` URL with an ASCII DNS host and only
RFC 3986 characters. A native presenter that refuses the URL rejects with
`C15T_PRESENTER_INVALID_URL`; the provider logs it with `console.error` and
stops retrying. Other refusals are `C15T_PRESENTER_UNAVAILABLE` and are
retried. `autoPresent` also takes a
boolean decided at runtime, as long as the URL is passed, and `children` is
optional.
An app that renders `ConsentBanner`, `ConsentDialog` or its own prompt should
pass `autoPresent={false}`; `presentConsentPrompt` and `presentPreferences` work
as before.

In a binary built without the stock native screens, whose handshake reports
`nativeUI: false`, the provider presents nothing and does not check
`privacyPolicyURL`. A presenter rejection with `C15T_NATIVE_UI_EXCLUDED` is
logged once with `console.error` and never retried. A binary that reports no
`nativeUI` flag links the screens, as before.
