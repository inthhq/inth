---
packages:
  '@c15t/react-native': minor
---

### Theme the native screens and the React Native components from one object

`createConsentTheme` and the Expo plugin's `theme` option now take the same
`ConsentThemeOptions` object, named after the web theme in `@c15t/ui`. Keep it
in a JSON file and pass it to both: the plugin writes the values the native
screens draw at prebuild, and `createConsentTheme` styles `ConsentBanner`,
`ConsentDialog`, `ConsentPreferences` and `ConsentIabDrawer`.

The plugin's `theme` option adds `radius.sm` and `radius.lg`, `spacing`,
`typography.fontFamily`, `typography.fontSize` and `slots` for the native
screens. It accepts the fields only the components draw, such as `motion` and
`colors.border`, and leaves them out of the native keys.

`typography.fontFamily` takes the same per-platform form as `headlineFont`:
one font resource name such as `inter_regular`, or
`{ ios: 'Inter-Regular', android: 'inter_regular' }`. `createConsentTheme`
takes the same shape, and its components draw the name for their platform.

**Breaking.** The React Native theme uses the web names:

- `onPrimary` is `textOnPrimary`, `switchTrackOn` is `switchTrackActive` and
  `surfaceRaised` is `surfaceHover`.
- Spacing is `xs`, `sm`, `md`, `lg` and `xl`. Radii are `sm`, `md`, `lg` and
  `full`; `control` is `md` and `surface` is `lg`.
- `typography` is the web scale (`fontFamily`, `headlineFont`, `fontSize`,
  `fontWeight`, `lineHeight`). `resolveConsentTypeRoles` returns the banner and
  dialog text styles derived from it.
- A theme carries both palettes, `colors` and `dark`, and the components draw
  the one the device appearance selects, for host themes too. `lightTheme` and
  `darkTheme` are replaced by `defaultConsentTheme`.
