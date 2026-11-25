---
packages:
  "@inth/react-native": patch
---

### React Native: the native screens use the web accent, and the switch off-track has its own colour

The native consent screens (SwiftUI and Compose) now draw links, switches and Save in the web's accent instead of the old `#335CFF`:

| Native `primary` | Before    | After     |
| ---------------- | --------- | --------- |
| Light            | `#335CFF` | `#2563EB` |
| Dark             | `#8CA2FF` | `#8AB4FF` |

Light is the web's `--inth-primary`. Dark is the web's dark `--inth-primary-text`, not its dark fill `#2F66DF`: the native screens draw links in `primary`, and the fill is only about 3.3:1 on the dark surface. A theme that sets `primary` is unchanged.

`ConsentThemeColors` has a new colour, `switchTrackOff`, for the track of a switch that is off. It is `#8492A6` in light mode and `#64748B` in dark mode, as the web's `--inth-switch-track-off`. The off track used `switchTrack` before, which is only about 1.4:1 on the surface; the off track now reaches 3:1. `switchTrack` still colours the sheet's grab handle. If your theme sets `switchTrack` and not `switchTrackOff`, the off track keeps the stock colour, as on the web. If you build a `ConsentTheme` object without `createConsentTheme`, add `switchTrackOff` to `colors` and `dark`.

The Expo plugin's `theme` option accepts `switchTrackOff` and, like the other switch colours, does not write it to the native screens: they draw the platform switch, tinted with `primary`.
