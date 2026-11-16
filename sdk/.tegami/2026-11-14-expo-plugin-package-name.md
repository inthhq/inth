---
packages:
  '@c15t/react-native': minor
---

### Name the Expo config plugin `@c15t/react-native`

The Expo config plugin now loads by package name, so `app.json` and
`app.config.ts` can list it the way Expo plugins usually are:

```ts
plugins: [['@c15t/react-native', { backendURL: 'https://your-project.inth.app' }]]
```

`'@c15t/react-native/expo-plugin'` still works and gives the same native
configuration, and it stays the import path for `C15tPluginProps`.

The plugin now uses your app's own `expo/config-plugins` instead of installing
`@expo/config-plugins` 57. Apps on Expo SDK 55, 56 and 58 no longer get a
second copy that does not match their SDK. `expo` 55 through 58 is an optional
peer dependency, so a bare React Native app installs nothing extra.
