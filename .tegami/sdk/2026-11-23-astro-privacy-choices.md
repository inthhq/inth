---
packages:
  "group:sdk": patch
---

### Astro: the consent prompt and the "Your Privacy Choices" dialog

`<ConsentBanner />` renders the consent prompt the way React's banner does: a Card, a Banner or a Drawer, placed by `presentation.prompt.container` or the policy's `surface.container`.

```js
// astro.config.mjs
inth({
  presentation: {
    prompt: { container: { type: "card", position: "start" } },
  },
});
```

What the prompt does:

- **Card, Banner and Drawer:** the server renders the collapsed prompt for the desktop layout, so it is in the first HTML. In the browser it switches to the phone layout at 640px and narrower without replacing its elements.
- **Customize** opens the options in place: the cookie categories in the EU, and the sale rights row and Preferences in the US. A side Drawer shows them from the start. Their code and stylesheets load when Customize opens them, or earlier when the visitor hovers or focuses Customize.
- **After a choice,** the prompt leaves, the outcome is announced to screen readers, and focus moves to your "Your Privacy Choices" link. Focus goes to `data-testid="privacy-choices-link"`, then `consent-dialog-trigger`, then `<ConsentDialogLink />`.
- **Blocking** (`blockUntilChoice`) makes the page behind the prompt inert, gives the prompt a backdrop, and keeps focus inside it. Esc folds the options and never closes the prompt.
- The consent engine loads with the page, not after it.

**Stylesheets:** a page inlines the theme tokens, the buttons and the rules of the one container it shows. A Drawer page carries no Card or Banner rules.

**Dialog:** the dialog island renders the "Your Privacy Choices" dialog, with its phone sheets, and adds its stylesheets when it opens.

**Customization:** the prompt reads the same `theme.slots` keys as React's `components` parts, such as `consentBanner`, `consentBannerCard`, `consentBannerExpand`, `consentBannerRightsRow`, `consentBannerSaveButton` and `consentBannerTag`. `noStyle` removes the stock classes. The `data-testid` values match React's.
