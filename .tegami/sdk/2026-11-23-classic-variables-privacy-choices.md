---
packages:
  "group:sdk": patch
---

### The classic banner and dialog variables style the consent UI

If you styled the consent banner or dialog through their component variables, such as `--consent-banner-border-radius` or `--consent-dialog-background-color`, that styling carries over. Each part reads its own hook first, then the classic variable, then the theme token, so `--consent-card-radius` wins over `--consent-banner-border-radius` on the Card. A `-dark` variable applies in dark mode only, as before.

The stylesheets no longer declare these variables on `:root`; each default now sits where the variable is read, with the same value. Two things change as a result:

- A palette scoped to `.inth-theme-root` or to the banner now reaches every part of the banner and dialog that these variables style. Before, they resolved their tokens once, on `:root`.
- `getComputedStyle(document.documentElement).getPropertyValue('--consent-banner-z-index')` and the like return an empty string unless you set the variable yourself.

The dialog caps its height at `min(640px, 100%)`. Set `--consent-dialog-max-height` to change the cap.

The full table, including the classic variables Inth doesn't read and why, is in the theme tokens docs under "Classic variable compatibility".

| Classic variable | Hook that wins | Part |
| --- | --- | --- |
| `--consent-banner-font-family` | — | Card, Banner, Drawer: the layer font |
| `--consent-banner-line-height` | — | Card, Banner, Drawer: the layer line height |
| `--consent-banner-text-size-adjust` | — | Card, Banner, Drawer: the layer text size adjust |
| `--consent-banner-border-radius` | `--consent-card-radius` | Card: the card corners |
| `--consent-banner-max-width` | `--consent-card-width` | Card: the corner card width |
| `--consent-banner-wall-max-width` | `--consent-card-width` | Card: the centred card width |
| `--consent-banner-padding` | — | Card: the head and footer inset |
| `--consent-banner-padding-mobile` | — | Card: the head and footer inset on phone |
| `--consent-banner-entry-duration` | — | Card, Banner, Drawer: the entrance and the scrim fade-in |
| `--consent-banner-entry-timing` | — | Card, Banner, Drawer: the entrance easing |
| `--consent-banner-animation-timing` | — | Card, Banner, Drawer: the exit easing |
| `--consent-banner-border-width` | — | Card, Banner, Drawer: the card border, the footer divider and the flush edge |
| `--consent-banner-shadow` | `--consent-card-shadow`, `--consent-bar-shadow` | Card, Banner: the card shadow |
| `--consent-banner-shadow-dark` | `--consent-card-shadow`, `--consent-bar-shadow` | Card, Banner: the card shadow in dark mode |
| `--consent-banner-background-color` | `--consent-surface-background` | Card, Banner, Drawer: the card background |
| `--consent-banner-background-color-dark` | `--consent-surface-background` | Card, Banner, Drawer: the card background in dark mode |
| `--consent-banner-footer-background-color` | `--consent-surface-footer-background` | Card, Banner, Drawer: the footer background |
| `--consent-banner-footer-background-color-dark` | `--consent-surface-footer-background` | Card, Banner, Drawer: the footer background in dark mode |
| `--consent-banner-text-color` | — | Card, Banner, Drawer: the card text |
| `--consent-banner-text-color-dark` | — | Card, Banner, Drawer: the card text in dark mode |
| `--consent-banner-border-color` | `--consent-surface-border-color` | Card, Banner, Drawer: the card border and the footer divider |
| `--consent-banner-border-color-dark` | `--consent-surface-border-color` | Card, Banner, Drawer: the card border and the footer divider in dark mode |
| `--consent-banner-title-color` | — | Card, Banner, Drawer: the title |
| `--consent-banner-title-color-dark` | — | Card, Banner, Drawer: the title in dark mode |
| `--consent-banner-description-color` | — | Card, Banner, Drawer: the description, and the Banner sentence |
| `--consent-banner-description-color-dark` | — | Card, Banner, Drawer: the description, and the Banner sentence in dark mode |
| `--consent-banner-overlay-background-color` | — | Card, Banner, Drawer: the blocking scrim |
| `--consent-banner-overlay-background-color-dark` | — | Card, Banner, Drawer: the blocking scrim in dark mode |
| `--consent-banner-z-index` | `--consent-surface-z-index` | Card, Banner, Drawer: the layer stacking |
| `--consent-dialog-font-family` | — | Dialog: the dialog font |
| `--consent-dialog-line-height` | — | Dialog: the dialog line height |
| `--consent-dialog-title-font-size` | — | Dialog: the title size |
| `--consent-dialog-title-font-weight` | — | Dialog: the title weight |
| `--consent-dialog-title-letter-spacing` | — | Dialog: the title tracking |
| `--consent-dialog-description-font-size` | — | Dialog: the intro size |
| `--consent-dialog-description-font-weight` | — | Dialog: the intro weight |
| `--consent-dialog-description-line-height` | — | Dialog: the intro line height |
| `--consent-dialog-footer-gap` | — | Dialog: the footer gap |
| `--consent-dialog-footer-font-size` | — | Dialog: the footer note size |
| `--consent-dialog-stroke-color` | — | Dialog: the footer divider |
| `--consent-dialog-stroke-color-dark` | — | Dialog: the footer divider in dark mode |
| `--consent-dialog-border-color` | — | Dialog: the card edge |
| `--consent-dialog-border-color-dark` | — | Dialog: the card edge in dark mode |
| `--consent-dialog-background-color` | — | Dialog: the card background |
| `--consent-dialog-background-color-dark` | — | Dialog: the card background in dark mode |
| `--consent-dialog-foreground-color` | — | Dialog: the card text |
| `--consent-dialog-foreground-color-dark` | — | Dialog: the card text in dark mode |
| `--consent-dialog-muted-color` | — | Dialog: the intro |
| `--consent-dialog-muted-color-dark` | — | Dialog: the intro in dark mode |
| `--consent-dialog-card-padding` | — | Dialog: the outer gap and the inset of the header, body and footer |
| `--consent-dialog-card-padding-mobile` | — | Dialog: the inset of the header, body and footer on phone |
| `--consent-dialog-card-gap` | — | Dialog: the space above the intro |
| `--consent-dialog-footer-padding-y` | — | Dialog: the footer padding above and below |
| `--consent-dialog-card-radius` | `--consent-dialog-radius` | Dialog: the card corners |
| `--consent-dialog-max-width` | `--consent-dialog-width` | Dialog: the card width |
| `--consent-dialog-max-height` | — | Dialog: the card height cap (read under the same name) |
| `--consent-dialog-z-index` | — | Dialog: the layer stacking (read under the same name) |
| `--consent-dialog-card-shadow` | — | Dialog: the card shadow, under its edge |
| `--consent-dialog-border-width` | — | Dialog: the card edge and the footer divider |
| `--consent-dialog-border-style` | — | Dialog: the footer divider style |
| `--consent-dialog-animation-timing` | — | Dialog: the backdrop and card entrance easing |
