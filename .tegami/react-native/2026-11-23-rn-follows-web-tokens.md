---
packages:
  "@inth/react-native": patch
---

### React Native: the default theme follows the web's one consent UI

The default theme of the React Native consent components now matches the web defaults of the one consent UI.

**Colors**

| Token               | Light, before → after | Dark, before → after  |
| ------------------- | --------------------- | --------------------- |
| `primary`           | `#335CFF` → `#2563EB` | `#6685FF` → `#2F66DF` |
| `switchTrackActive` | `#335CFF` → `#2563EB` | `#6685FF` → `#2F66DF` |
| `focus`             | `#335CFF` → `#2563EB` | `#6685FF` → `#2F66DF` |
| `primaryBorder`     | `#2C4FDB` → `#2055CA` | `#5872DB` → `#2858C0` |

`ConsentThemeColors` has a new color, `primaryText`, for the label of the accent action (Customize, Save Settings). It is `#2563EB` in light mode and `#8AB4FF` in dark mode, as the web's `--inth-primary-text`: the dark primary is only 3.6:1 as text on the dark surface. If your theme sets `primary` and not `primaryText`, the label uses your `primary`, as before. If you build a `ConsentTheme` object without `createConsentTheme`, add `primaryText` to `colors` and `dark`.

**Radii**

`radius.lg` (the banner and sheet corners) is `16`, not `12`. `radius.md` (buttons and category rows) is `10`, not `8`.

**Type**

- The banner body line height is `21`, not `20` (`sm` over the normal line height).
- The dialog and sheet heading is 17 semibold over a 21.25 line, not 14 over 14. Its tracking is `-0.015em`, not `-0.025em`.
- The dialog and sheet description is 13 over 19.5, not 16 over 24.

Each size still scales with the theme's `typography.fontSize`.
