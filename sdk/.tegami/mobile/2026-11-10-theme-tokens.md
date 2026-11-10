---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Theme the native consent screens with the web token names

`ConsentTheme` on Swift and Android now uses the names of the web `--c15t-*`
tokens and adds spacing, type sizes, a body font and per-part slots. The old
names are gone, with no aliases.

- Colors: `accent` is `primary`, `onAccent` is `textOnPrimary`,
  `textSecondary` is `textMuted` and `onDecision` is `textOnDecision`.
- `cornerRadius` is `radius.md`. `radius.sm` (callouts) and `radius.lg` (the
  notice card and dialogs) follow it until set.
- `spacing` (`xs` to `xl`) sets page gutters, section gaps and padding.
- `typography` holds `fontFamily`, `headlineFont` (moved from the theme root)
  and `fontSize` `sm`, `base` and `lg`. Each text role scales with its group
  and still follows Dynamic Type or the Android font scale.
- `slots` restyle `consentBannerTitle`, `consentBannerDescription`,
  `buttonPrimary` and `buttonSecondary` with `color`, `backgroundColor`,
  `borderRadius` and `fontSize`. `buttonPrimary` colors keep the 5:1 decision
  contrast floor.
- `Info.plist` and manifest keys follow: `com.c15t.consent.primary` /
  `PRIMARY`, `radiusMd` / `RADIUS_MD`, `spaceLg` / `SPACE_LG`, `fontSizeBase` /
  `FONT_SIZE_BASE`, and `buttonPrimary.borderRadius` /
  `BUTTON_PRIMARY_BORDER_RADIUS` for a slot field.
