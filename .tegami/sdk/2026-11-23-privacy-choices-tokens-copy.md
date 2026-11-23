---
packages:
  "group:sdk": patch
---

### The attribution tag reads "Consent by", plus new theme tokens and copy for the Privacy Choices surfaces

The English attribution tag on the banner, dialog and widget now reads "Consent by [INTH]" instead of "Secured by". The old wording sounded like a security promise. The translation key is still `common.securedBy`, so a custom string you set there still wins. Other languages keep their current wording until they are translated again.

New theme tokens. They are all optional. When your theme leaves one out, it follows a token you already set, so an existing theme keeps working:

| CSS variable | Theme key | When your theme leaves it out |
| --- | --- | --- |
| `--inth-primary-text` | `colors.primaryText` | Follows `colors.primary` |
| `--inth-primary-tint` | `colors.primaryTint` | `colors.primary` mixed into `colors.surface`: 10% in light mode, 18% in dark mode. Always opaque, even when `colors.primary` has alpha |
| `--inth-danger` | `colors.danger` | `#dc2626` (dark mode: `#f87171`) |
| `--inth-border-strong` | `colors.borderStrong` | `rgba(15, 23, 42, 0.16)` (dark mode: `#3a404e`) |
| `--inth-overlay-block` | `colors.overlayBlock` | `rgba(15, 23, 42, 0.62)` (dark mode: `rgba(0, 0, 0, 0.72)`) |
| `--inth-overlay-block-solid` | `colors.overlayBlockSolid` | `rgba(15, 23, 42, 0.78)` (dark mode: `rgba(0, 0, 0, 0.85)`) |
| `--inth-switch-track-off` | `colors.switchTrackOff` | `#8492a6` (dark mode: `#64748b`), also when you set only `colors.switchTrack`, which is too faint for an off state |
| `--inth-radius-container` | `radius.container` | `radius.lg`, but no more than 12px. A square theme's `'0'` works |
| `--inth-radius-nested` | `radius.nested` | `radius.md`, but no more than 8px |
| `--inth-easing-out-strong` | `motion.easingOutStrong` | `cubic-bezier(0.23, 1, 0.32, 1)` |

Vue and Nuxt `tokens` accept the same names without the leading `--`. No current token changes its default value, and the stock components don't use the new tokens yet.

`@inth/sdk/translations` has a new optional `privacyChoices` section, in English only for now. It holds the copy for the Privacy Choices surfaces: the one-line banners, the US opt-in prompt, the Global Privacy Control note, the receipt scope, the Preferences row and the screen-reader announcements. In other languages, any key that is not translated shows in English. Sentences that depend on the rights you configure have placeholders. To fill them in, use the new builders, exported from `@inth/sdk/surface-state`:

- `resolveRightsBundle(rights)` gives the rights bundle: `all`, `sale-share` or `sale-ads`.
- `resolveRightsPhrases`, `scopePhrase`, `resolveOptInPromptCopy`, `resolveGpcNote`, `resolveNoticeBarDescription`, `resolveBannerAllowedAnnouncement`, `resolveReceiptScope` and `resolvePreferencesRowCopy` build the full sentences.

Each sentence names only the rights your configuration actually controls.
