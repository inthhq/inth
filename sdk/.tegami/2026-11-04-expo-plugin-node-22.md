---
packages:
  '@c15t/react-native': patch
---

### Load the Expo config plugin as ESM on Node 22

Importing `@c15t/react-native/expo-plugin` from an ES module on Node 22, such
as an `app.config.mjs`, failed with "Named export 'AndroidConfig' not found".
`@expo/config-plugins` defines `AndroidConfig` and `IOSConfig` in a way Node 22
cannot detect as named exports. The plugin now reads them in a way that works on
every supported Node version. Expo's CLI, which loads the CommonJS entry, was
not affected.
