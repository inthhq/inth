---
packages:
  "group:sdk": patch
---

### Vue and Nuxt: fixes to the Privacy Choices banner and dialog

These fixes apply when you use `design: 'privacy-choices'` (or set `presentation.prompt.container`). The classic banner and dialog do not change.

- An opt-in confirmation now opens while the new banner is on the page, and the new dialog hosts it when no banner does. Before, it stayed pending and nothing showed.
- The banner shows only the actions your policy allows. For example, a policy with `actions: ['accept', 'reject']` has no Customize button. `presentation.prompt.layout` sets the order of the buttons, as on the classic banner. Its groups, such as `['customize', ['accept', 'reject']]`, keep their wrapper and the `banner.actionGroup` part in every presentation, the slim bar included.
- If a visitor opens the options on a phone, then widens the window to a side Drawer and narrows it again, the options are closed.
- The "Selling, sharing and targeted ads" text names the rights your backend confirmed for a held opt-out, not always all three.
- The `banner.title`, `description.banner` and `banner.footer` parts now style the slim bar as well.
- Like the classic banner, the new banner sets `dir` from the banner's language and carries `data-inth-surface="banner"`. `disableAnimation` stops its entrance animations (the root gets `data-animation="off"`). The space above the US Preferences categories now comes from the stylesheet.
- An opt-out from a one-click "Do Not Sell" control, or one carried across a `reloadOnConsentRevoked` reload, now opens the Privacy Choices dialog with focus on its receipt, instead of the classic confirmation. A standalone `<OptOutConfirmation />` you mounted still shows itself.
- New `<PrivacyChoicesLink />` (also a global Nuxt component). Under an opt-out policy it is the opt-out link from `presentation.optOutLink`. On the Privacy Choices design it also shows under opt-in policies, in the US and the EU, as "Your Privacy Choices" without the opt-out icon, so visitors always have a way back into the dialog. Focus returns to it, then to the floating trigger, when the dialog closes and its opener is gone. **This needs product sign-off before release.**
- An opt-in policy without a US marker (the `opt-out` right or a GPC rule) always gets the EU dialog, whatever its prompt.
- Phone sheets take the prompt's resolved edge style. A Card is always inset, so a Card prompt with `edgeStyle: 'flush'` now gives inset sheets.
- A phone sheet closed and reopened quickly stays open. A closing sheet clears at once on desktop, under reduced motion and when the dialog closes.
- Chevrons that point to a sheet mirror on right-to-left pages, and the dialog sets `dir` from its language.
- A Privacy Choices page no longer downloads the classic dialog in idle time, whatever the banner did before.
- `disableAnimation`, on `<ConsentManager>` or in the config, now stops the dialog's motion: the backdrop, the card and phone sheets show at once, and the root gets `data-animation="off"`. Before, the stock root's dialog ignored the config's `disableAnimation`.
