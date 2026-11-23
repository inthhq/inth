---
packages:
  "group:sdk": patch
---

### Angular: smaller classic bundles and more fixes to the Privacy Choices banner and dialog

If your site keeps the classic design, `@inth/angular` no longer puts the Privacy Choices (v6) code in your main bundle. That code loads only when a page shows the Privacy Choices banner or dialog. The eager part of the main entry is about 86 KB smaller.

These fixes apply when you use `design: 'privacy-choices'` (or set `presentation.prompt.container`):

- Server rendering (Angular SSR) no longer fails on the Privacy Choices banner.
- If the banner's code fails to download, the banner tries again on the next options update, or the next time it must show. Before, the visitor saw no banner.
- If you switch the design with `updateOptions()` after both dialogs loaded, only the dialog for the current design opens.
- After a choice on a blocking banner, focus moves to "Your Privacy Choices". Before, focus went to the page while it was still blocked, and was lost.
- Opening a vendor list in the categories scrolls it into view again.
- On a server-rendered page, the banner keeps the desktop layout until hydration is complete, then switches to the phone layout. The receipt and the "Selling, sharing and targeted ads" text also show the server's values until hydration is complete.
- The opt-out icon in `<inth-privacy-choices-link>` is 14px tall when the page has no classic banner stylesheet. With `noStyle`, you size it.
- The dialog's root has `data-inth-surface="dialog"`, as the classic dialog's root has. The `consentDialog` theme slot styles it.
- Setting `open` on `<inth-consent-dialog>` to `false` right after it asked to show the dialog now closes it, as Close does, even before the dialog has shown, so an unanswered banner comes back.
