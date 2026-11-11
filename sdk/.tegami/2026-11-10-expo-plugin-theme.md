---
packages:
  '@c15t/react-native': minor
---

### Theme the native consent screens from the Expo plugin

The Expo config plugin takes a `theme` option. It sets the colors, corner
radius, headline font, app identity and provider attribution of the native
consent screens from `app.config.ts`, so you no longer need your own config
plugin for them. Field names follow the web theme: `colors.primary`,
`colors.textMuted` and `radius.md` match `--c15t-primary`,
`--c15t-text-muted` and `--c15t-radius-md`, and `dark` holds dark-mode colors.
Prebuild fails on a value the native screens cannot draw, such as an `hsl()`
color.

**Breaking.** The plugin no longer raises `minSdkVersion` and
`compileSdkVersion` in Gradle files. On Expo 55 to 58 the raise never ran,
because the templates set no SDK number. Prebuild now fails, naming the file
and value, when `expo-build-properties` or a Gradle file sets `minSdkVersion`
below 24 or `compileSdkVersion` below 36. Raise or remove that setting.
