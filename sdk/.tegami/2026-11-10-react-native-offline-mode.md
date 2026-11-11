---
packages:
  '@c15t/react-native': minor
---

### Run Expo offline mode on Android, and keep backend and offline modes apart

`mode: 'offline'` now starts the Android core with no backend, as on iOS. The
Expo plugin writes `com.c15t.MODE=offline` for it.

Offline mode is no-backend mode, so prebuild now refuses `backendURL`,
`initURL`, `policyResource` and `iab` with `mode: 'offline'`. IAB TCF needs a
backend to serve the Global Vendor List.
