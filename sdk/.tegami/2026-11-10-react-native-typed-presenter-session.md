---
packages:
  '@c15t/react-native': patch
---

### Narrow the native presenter session type

`ConsentPresenterSession` is now a union: `sessionId` is a string for
`presented` and `already-presented`, and `null` only for `not-required`. The
native hosts build typed sessions and outcomes and encode them at the bridge,
so the JSON events are unchanged. Docs for `useSetOverrides` and the native
`setOverrides` spec no longer mention a test override, which never existed.
