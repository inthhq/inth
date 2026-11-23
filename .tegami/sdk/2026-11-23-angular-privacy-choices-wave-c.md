---
packages:
  "group:sdk": patch
---

### Angular: smaller first load and more fixes to the consent banner and dialog

`@inth/angular` keeps the banner's container and the dialog out of your main bundle. Each loads only when a page shows it, so a page that owes no choice downloads neither.

- Server rendering (Angular SSR) no longer fails on the banner.
- If the banner's code fails to download, the banner tries again on the next options update, or the next time it must show. Before, the visitor saw no banner.
- After a choice on a blocking banner, focus moves to "Your Privacy Choices". Before, focus went to the page while it was still blocked, and was lost.
- Opening a vendor list in the categories scrolls it into view again.
- On a server-rendered page, the banner keeps the desktop layout until hydration is complete, then switches to the phone layout. The receipt and the "Selling, sharing and targeted ads" text also show the server's values until hydration is complete.
- The opt-out icon in `<inth-privacy-choices-link>` is 14px tall when the page has no legal-links stylesheet. With `noStyle`, you size it.
- The dialog's root has `data-inth-surface="dialog"`. The `consentDialog` theme slot styles it.
- Setting `open` on `<inth-consent-dialog>` to `false` right after it asked to show the dialog now closes it, as Close does, even before the dialog has shown, so an unanswered banner comes back.
