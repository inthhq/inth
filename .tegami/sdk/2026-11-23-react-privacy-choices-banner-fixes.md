---
packages:
  "group:sdk": patch
---

### React: fixes to the Privacy Choices consent banner

These fixes apply when you use `design: 'privacy-choices'` (or set `presentation.prompt.container`). The classic banner does not change.

- An opt-in confirmation now opens while the new banner is on the page. Before, it stayed pending and nothing showed.
- Folded options are hidden from keyboard and screen reader users on React 18 too. React 18 dropped the `inert` attribute.
- The banner shows only the actions your policy allows. For example, a policy with `actions: ['accept', 'reject']` has no Customize button. A `layout` on `ConsentBanner` sets the order of the buttons, as on the classic banner. Its groups, such as `['customize', ['accept', 'reject']]`, keep their wrapper and the `banner.actionGroup` part in every presentation, the slim Banner included. When the slim Banner stacks on a narrow screen, the group keeps its own box, so a background, border or padding you give that part still shows, and every button still gets an equal share of the width.
- If a visitor opens the options on a phone, then widens the window to a side Drawer and narrows it again, the options are closed. Esc on the side Drawer no longer does nothing.
- The "Selling, sharing and targeted ads" text names the rights your backend confirmed for a held opt-out, not always all three.
- `noStyle` on `ConsentBanner` removes the styles of its buttons too. The `banner.title`, `description.banner` and `banner.footer` parts now style the slim bar as well.
- Like the classic banner, the new banner sets `dir` from the banner's language and replaces the static banner from `index.html`. `disableAnimation` stops its entrance animations (the root gets `data-animation="off"`).
- The space above the US Preferences categories now comes from the stylesheet (`preferencesBody`), so `noStyle` removes it.
