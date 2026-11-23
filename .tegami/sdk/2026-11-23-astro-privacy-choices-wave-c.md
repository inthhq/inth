---
packages:
  "group:sdk": patch
---

### Astro: more Privacy Choices banner fixes

These fixes apply when your `presentation` uses `design: 'privacy-choices'`.

- **IAB regions:** on a site that shows the IAB banner in some regions and the Privacy Choices design in others, IAB visitors get the IAB banner again.
- **Experiments:** the browser now applies the experiment arm's `theme` to the banner and its options, as the server does, so an arm's slots and tokens stay after the first change.
- **Failed downloads:** if the banner's code fails to download, the next update tries again, so visitors are not left without a way to choose. The options in a side Drawer also try again.
- **Page transitions:** a `ClientRouter` navigation during the banner's download no longer leaves the new page without a working banner.
- **Fewer downloads:** a visitor who is not shown the banner, for example one who already chose, no longer downloads its code, stylesheets or options.
- **Styles:** a banner whose page lacks its stylesheets loads them, so it never stays unstyled. With a per-request CSP nonce and `ClientRouter`, the Privacy Choices stylesheets on the next page get the live nonce.
- **Phone Drawer:** on a side Drawer site, the phone layout's panel uses the in-place panel's class, not the side Drawer's.
- **`noStyle`:** the banner's legal links drop their class with `noStyle`.
- **Dialog:** a "Your Privacy Choices" click before the page script loads downloads the Privacy Choices dialog, not the classic one. With `ui: 'react'`, the classic dialog opens as fast as before again, because it ships with the island.
- **`<PrivacyChoicesLink />`:** the CCPA icon has its own size (14px tall), because the classic stylesheet that sized it does not load on a Privacy Choices page. With `noStyle`, the icon has no size.
- **Cleanup:** closing the banner cancels a vendor list's pending scroll.
