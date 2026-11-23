---
packages:
  "group:sdk": patch
---

### Consent prompt: the server-rendered banner no longer shifts while its stylesheets load

- Nuxt with `features.inlineStyles` (the default): a server-rendered Card no longer changes width for a moment after the page loads. The server inlines the banner's styles, and the browser then loads the same styles again as separate files. When the shared banner file arrived before the Card's own file, the shared rule for the card's width briefly won, so the card widened and the page shifted (about one load in fifty).
- The Card, Banner and Drawer rules that override the shared banner rules now win by selector weight, not by stylesheet order. The card's width, and the Banner and Drawer header, footer and tag insets, stay the same whatever order the stylesheets load in. Computed styles do not change.
