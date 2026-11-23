---
packages:
  "group:sdk": patch
---

### Astro: more consent prompt fixes

- **IAB regions:** on a site that shows the IAB banner in some regions and the consent prompt in others, IAB visitors get the IAB banner again.
- **Experiments:** the browser now applies the experiment arm's `theme` to the prompt and its options, as the server does, so an arm's slots and tokens stay after the first change.
- **Failed downloads:** if the prompt's code fails to download, the next update tries again, so visitors are not left without a way to choose. The options in a side Drawer also try again.
- **Page transitions:** a `ClientRouter` navigation during the banner's download no longer leaves the new page without a working prompt.
- **Fewer downloads:** a visitor who is not shown the prompt, for example one who already chose, no longer downloads its code, stylesheets or options.
- **Styles:** a prompt whose page lacks its stylesheets loads them, so it never stays unstyled. With a per-request CSP nonce and `ClientRouter`, the prompt's stylesheets on the next page get the live nonce.
- **Phone Drawer:** on a side Drawer site, the phone layout's panel uses the in-place panel's class, not the side Drawer's.
- **`noStyle`:** the prompt's legal links drop their class with `noStyle`.
- **Dialog:** a "Your Privacy Choices" click before the page script loads downloads the dialog and its stylesheets.
- **`<PrivacyChoicesLink />`:** the CCPA icon has its own size (14px tall), because a page that shows only the prompt does not load the stylesheet that sizes it. With `noStyle`, the icon has no size.
- **Cleanup:** closing the prompt cancels a vendor list's pending scroll.
