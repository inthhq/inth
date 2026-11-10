---
packages:
  '@c15t/react-native': minor
---

### Keep the offline-mode policy in your Expo config

`mode: 'offline'` now needs a `policy`: `{ rules: [...] }` in the backend's
`PolicyRule` names. Prebuild checks the rules, writes them into both native
projects and points the iOS and Android cores at them, so the first launch
shows the prompt with no backend. `policy` is refused in backend modes, and
`iab` rules are refused because IAB TCF needs a backend to serve the Global
Vendor List.
