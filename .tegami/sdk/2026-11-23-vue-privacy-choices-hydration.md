---
packages:
  "group:sdk": patch
---

### Vue and Nuxt: the consent banner hydrates cleanly and recovers from a failed load

- Nuxt hydrates the banner's Card, Banner or Drawer against the HTML the server rendered, even when its code arrives after the rest of the banner. Before, a change to the visitor's state in that gap (for example a choice made in another tab) caused a hydration mismatch. An all-in-one side Drawer's options hydrate the same way.
- A tap on Accept, Reject, Customize or OK before the page hydrated is no longer lost. The banner holds it and replays it through its own buttons once it hydrates, so it commits with the same protections and Customize opens the options in place.
- If the banner's code or its options fail to download, the banner tries again the next time it is owed or the consent state changes, instead of leaving the visitor with no banner.
- The dialog root carries `data-inth-surface="dialog"`. The `consentDialog` theme slot (`components.dialog.container`) styles it, and its `noStyle` drops the stock backdrop.
- A controlled dialog whose `open` turns `false` now closes through the consent manager, so an unanswered banner comes back and takes focus.
- `<InthProvider>` hosts an opt-in confirmation when no banner has shown and the dialog is closed, for example for a returning US visitor who opts in from a widget or a consent gate.
- `<PrivacyChoicesLink />` gives the opt-out icon its own size (14px tall), so it never renders at the browser's default size.
- The receipt and the "Selling, sharing and targeted ads" text read the server's copy of the opt-out receipt while hydrating, then this browser's, so they match the server's HTML.
- A vendor table reveal or a focus move still waiting when its part closes is cancelled.
