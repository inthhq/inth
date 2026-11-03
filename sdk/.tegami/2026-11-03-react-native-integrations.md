---
packages:
  '@c15t/react-native': minor
---

### Add React Native analytics and replay integrations

Connect app-owned Firebase Analytics, PostHog, Mixpanel, Amplitude and Sentry
Replay clients through `@c15t/react-native/integrations`. The bindings serialize
consent updates, apply refusal and withdrawal, and expose `ready`, `sync()` and
`disconnect()` for application lifecycle management.

Finish a Firebase refusal before reporting readiness if collection finishes
enabling after consent was withdrawn.
