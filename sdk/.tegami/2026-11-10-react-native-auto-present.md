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
