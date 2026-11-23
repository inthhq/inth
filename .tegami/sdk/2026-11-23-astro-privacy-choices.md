---
packages:
  "group:sdk": patch
---

### Astro: the Privacy Choices banner and dialog for `design: 'privacy-choices'`

`<ConsentBanner />` now renders the Privacy Choices design when your `presentation` opts in, the same way React's banner does: set `design: 'privacy-choices'`, or give the prompt a `container`.

```js
// astro.config.mjs
inth({
  presentation: {
    design: "privacy-choices",
    prompt: { container: { type: "card", position: "start" } },
  },
});
```

On the classic design, nothing changes.

What the banner does:

- **Card, Banner and Drawer:** the server renders the collapsed prompt for the desktop layout, so it is in the first HTML. In the browser it switches to the phone layout at 640px and narrower without replacing its elements.
- **Customize** opens the options in place: the cookie categories in the EU, and the sale rights row and Preferences in the US. A side Drawer shows them from the start. Their code and stylesheets load when Customize opens them, or earlier when the visitor hovers or focuses Customize.
- **After a choice,** the banner leaves, the outcome is announced to screen readers, and focus moves to your "Your Privacy Choices" link. Focus goes to `data-testid="privacy-choices-link"`, then `consent-dialog-trigger`, then `<ConsentDialogLink />`.
- **Blocking** (`blockUntilChoice`) makes the page behind the prompt inert, gives the prompt a backdrop, and keeps focus inside it. Esc folds the options and never closes the prompt.
- On a Privacy Choices page the consent engine loads with the page, not after it.

**Stylesheets:** a page inlines the theme tokens, the buttons and the rules of the one presentation it shows. A Drawer page carries no Card or Banner rules. The classic first-paint stylesheet is not added to a Privacy Choices page.

**Dialog:** with `ui: 'react'`, the dialog island renders React's "Your Privacy Choices" dialog, with its phone sheets, and adds its stylesheets when it opens instead of the classic dialog's. With `ui: 'svelte'` or `ui: 'vue'`, the classic dialog stays until those frameworks support the Privacy Choices design.

**Customization:** the banner reads the same `theme.slots` keys as React's `components` parts, such as `consentBanner`, `consentBannerCard`, `consentBannerExpand`, `consentBannerRightsRow`, `consentBannerSaveButton` and `consentBannerTag`. `noStyle` removes the stock classes. The `data-testid` values match React's.
