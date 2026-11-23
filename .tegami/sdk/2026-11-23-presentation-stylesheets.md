---
packages:
  "group:sdk": patch
---

### Stylesheets for the Card, Banner and Drawer consent prompt

`@inth/sdk/ui` ships the styles for the new consent prompt, split so a page loads only the presentation it uses. Each is a sheet in `@inth/sdk/ui/styles/sheets/`: `surface` holds what every presentation shares (the card, its footer, the "Consent by" tag and the blocking overlay), `card`, `bar` and `drawer` hold one presentation each, and `expand` holds the options that Customize opens in place. A Card's inline CSS (`tokens`, `button`, `surface` and `card`) is smaller than today's banner.

The rules are also in `styles.css` and `styles.tw3.css`, and the "Your Privacy Choices" dialog's new rules are in the `dialog` sheet. Every value follows your theme's `--inth-*` tokens, and each part has hooks you can set on any ancestor, such as `--consent-card-width`, `--consent-bar-max-width`, `--consent-drawer-side-width` and `--consent-tag-background`.

The sheets place a Card or Drawer by its `data-placement`: `card-start`, `card-end`, `card-center`, `drawer-start`, `drawer-end`, `drawer-top` or `drawer-bottom`. `start` and `end` follow the page's writing direction through logical CSS properties, so on a right-to-left page a `start` Card sits in the bottom-right corner and a `start` Drawer slides in from the right.

The stock components don't use these styles yet, so nothing on the page changes. The `dialog` sheet grows by about 2.8 kB (brotli) until they do.
