---
packages:
  "group:sdk": patch
---

### React: fixes to the Privacy Choices dialog

- `<ConsentDialog showTrigger />` shows the floating trigger again. An opt-in confirmation opens from `ConsentDialog` when no banner is on the page.
- An opt-out from a one-click "Do Not Sell" control now opens the Privacy Choices dialog with focus on its receipt, instead of nothing. A standalone `<OptOutConfirmation />` you mounted still shows itself.
- Opting out in the dialog or the banner's options now survives `reloadOnConsentRevoked`: the page still reloads at once, and after the reload the dialog opens on the receipt. Before, the visitor saw nothing after the reload.
- `<PrivacyChoicesLink />` now also shows under opt-in policies, in the US and the EU, as "Your Privacy Choices" without the opt-out icon, so visitors always have a way back into the dialog. Focus returns to it when the dialog closes. **This needs product sign-off before release.**
- Covered, closing and folded parts of the dialog are hidden from keyboard and screen reader users on React 18 too. React 18 dropped the `inert` attribute.
- `<ConsentDialog open />` now opens the dialog through the consent manager: the banner hands over to it, and phone sheets and Esc work. Close and Esc close it; set `open` to `false` and back to `true` to open it again. `open={false}` hides it. Setting `open` to `false` while the dialog shows, or while it is still loading its styles, now closes it as Close does, so an unanswered banner comes back. Before, the dialog hid but the banner stayed away. Under `open={false}`, an opt-out confirmation shows on its own instead of opening a dialog that stays hidden.
- A phone sheet closed and reopened quickly stays open.
- `disableAnimation` on `ConsentDialog` now stops the dialog's motion: the backdrop, the card and phone sheets show at once, and the root gets `data-animation="off"`, as on the banner.
- `legalLinks` on `ConsentDialog` now applies to the dialog's footer link (the Cookie Policy in the EU, the Privacy Policy in the US): `null` hides it, and a list shows it only when its key is in the list.
- An opt-in policy without a US marker (the `opt-out` right or a GPC rule) always gets the EU dialog, whatever its prompt.
- Phone sheets take the prompt's resolved edge style. A Card is always inset, so a Card prompt with `edgeStyle: 'flush'` now gives inset sheets.
- The vendor chevron turns when its table opens, and chevrons that point to a sheet mirror on right-to-left pages.
- Hovering a link that opens the dialog before `<ConsentDialog />` mounts no longer downloads the classic dialog on a Privacy Choices page.
- `noStyle` on `ConsentDialog` removes the styles of Done and the EU buttons. The dialog sets `dir` from its language, and the Preferences count updates as switches change.

New in `@inth/sdk/surface-state`: `resolvePrivacyChoicesRegime` (US or EU dialog for a policy), `resolveConsentDesign` and `resolvePrivacyChoicesLink`.
