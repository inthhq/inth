---
packages:
  "group:sdk": patch
---

### Angular: fixes to the Privacy Choices banner and dialog

These fixes apply when you use `design: 'privacy-choices'` (or set `presentation.prompt.container`). The classic banner and dialog do not change.

The banner:

- An opt-in confirmation now opens while the new banner is on the page. Before, it stayed pending and nothing showed.
- The banner shows only the actions your policy allows. For example, a policy with `actions: ['accept', 'reject']` has no Customize button. A `layout` on `<inth-consent-banner>` sets the order of the buttons, as on the classic banner. Its groups, such as `['customize', ['accept', 'reject']]`, keep their wrapper and the `consentBannerFooterSubGroup` theme slot in the slim bar too.
- If a visitor opens the options on a phone, then widens the window to a side Drawer and narrows it again, the options are closed. Esc on the side Drawer no longer does nothing.
- The "Selling, sharing and targeted ads" text names the rights your backend confirmed for a held opt-out, not always all three.
- The `consentBannerTitle`, `consentBannerDescription` and `consentBannerFooter` theme slots now style the slim bar as well.
- Like the classic banner, the banner sets `dir` from the visitor's language and `data-inth-surface="banner"` on its root. `disableAnimation` stops its entrance animations (the root gets `data-animation="off"`).
- The space above the US Preferences categories now comes from the stylesheet, so `noStyle` removes it.

The dialog:

- `<inth-consent-dialog [showTrigger]="true">` shows the floating trigger, and the dialog hosts an opt-in confirmation when no banner is on the page.
- An opt-out from a one-click "Do Not Sell" control, or after `reloadOnConsentRevoked` reloads the page, now opens the dialog with focus on its receipt. A standalone `<inth-opt-out-confirmation>` you mounted still shows itself, and a dialog whose `models` leave out the policy shows the classic confirmation.
- `open` set to `true` now opens the dialog through the consent manager: the banner hands over to it, and phone sheets and Esc work. Close and Esc close it and emit `openChange(false)`; set `open` to `false` and back to `true` to open it again. `false` hides it. Setting `open` to `false` while the dialog shows closes it as Close does, so an unanswered banner comes back. Under `open` set to `false`, an opt-out confirmation shows on its own instead of opening a dialog that stays hidden.
- A phone sheet closed and reopened quickly stays open.
- `disableAnimation` now stops the dialog's motion: the backdrop, the card and phone sheets show at once, and the root gets `data-animation="off"`, as on the banner.
- `legalLinks` on `<inth-consent-dialog>` now applies to the Privacy Choices dialog's footer link (the Cookie Policy in the EU, the Privacy Policy in the US): `null` hides it, and a list shows it only when its key is in the list.
- An opt-in policy without a US marker (the `opt-out` right or a GPC rule) always gets the EU dialog, whatever its prompt.
- Phone sheets take the prompt's resolved edge style. A Card is always inset, so a Card prompt with `edgeStyle: 'flush'` now gives inset sheets.
- Chevrons that open a sheet carry `data-direction="end"` and mirror on right-to-left pages. The dialog sets `dir` from the visitor's language.
- When the control that opened the dialog is gone, focus returns to "Your Privacy Choices", then to the floating trigger.

New: `<inth-privacy-choices-link>`, the "Your Privacy Choices" footer link. It opens the dialog and never records an opt-out on its own. Under an opt-out policy it reads your `presentation.optOutLink` title, with the opt-out icon beside the Privacy Choices titles. Under the Privacy Choices design it also shows under opt-in policies, in the US and the EU, as "Your Privacy Choices" without the icon, so visitors always have a way back into the dialog. **This needs product sign-off before release.**
