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
`autoPresent={false}`, and the provider throws on render without an HTTPS URL.
An app that renders `ConsentBanner`, `ConsentDialog` or its own prompt should
pass `autoPresent={false}`; `presentConsentPrompt` and `presentPreferences` work
as before.
