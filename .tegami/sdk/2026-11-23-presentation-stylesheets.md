---
packages:
  "group:sdk": patch
---

### Stylesheets for the Card, Banner and Drawer consent prompt

`@inth/sdk/ui` ships the styles for the new consent prompt, split so a page loads only the presentation it uses. Each is a sheet in `@inth/sdk/ui/styles/sheets/`: `surface` holds what every presentation shares (the card, its footer, the "Consent by" tag and the blocking overlay), `card`, `bar` and `drawer` hold one presentation each, and `expand` holds the options that Customize opens in place. A Card's inline CSS (`tokens`, `button`, `surface` and `card`) is smaller than today's banner.

The "Your Privacy Choices" dialog has a sheet of its own, `privacy-choices-dialog`, which renders after `expand`. If your app imports whole stylesheets, import `@inth/sdk/ui/styles/privacy-choices.css` (or `styles/privacy-choices.tw3.css`) after `styles.css` to get all of these rules at once. Every value follows your theme's `--inth-*` tokens, dark mode included, whether it is set by `.dark` or `.inth-dark`, on the page or on the script tag's shadow host. Each part has hooks you can set on any ancestor, such as `--consent-card-width`, `--consent-bar-max-width`, `--consent-drawer-side-width` and `--consent-tag-background`.

The sheets place a Card or Drawer by its `data-placement`: `card-start`, `card-end`, `card-center`, `drawer-start`, `drawer-end`, `drawer-top` or `drawer-bottom`. `start` and `end` follow the page's writing direction through logical CSS properties, so on a right-to-left page a `start` Card sits in the bottom-right corner and a `start` Drawer slides in from the right.

The stock components don't use these styles yet, so nothing on the page changes. `styles.css`, `styles.tw3.css`, `first-paint` and `dialog` stay the size they were. The scroll fades register two properties, `--inth-fade-top` and `--inth-fade-bottom`, and only on pages that load the new sheets. Inside a shadow root, such as the script tag's, where Chromium ignores a stylesheet's `@property`, the scroll-fade controller registers them on the page with `CSS.registerProperty`, so the fades still animate.
