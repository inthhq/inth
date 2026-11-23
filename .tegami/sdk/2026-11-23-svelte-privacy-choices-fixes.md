---
packages:
  "group:sdk": patch
---

### Svelte and SvelteKit: fixes to the Privacy Choices banner and dialog

These fixes apply when you use `design: 'privacy-choices'` (or set `presentation.prompt.container`). The classic banner and dialog do not change.

Banner:

- An opt-in confirmation now opens under the Privacy Choices banner. Before, a pending opt-in waited forever.
- The first layer shows only the actions the policy allows, in the order and groups of the banner's `layout`, in the Card, the Drawer and the slim Banner. Its groups keep their wrapper and the `consentBannerFooterSubGroup` theme slot in the slim Banner too.
- An expansion opened in the phone Drawer folds when the layout becomes all-in-one, so it does not reopen when the viewport narrows again.
- The rights row names the rights a backend confirmed for this browser's opt-out.
- The slim Banner's title, description and actions take the `consentBannerTitle`, `consentBannerDescription` and `consentBannerFooter` theme slots.
- The banner root sets `dir` from its language, carries `data-inth-surface="banner"`, and sets `data-animation="off"` with `disableAnimation`. The spacing under the Preferences row comes from the stylesheet, so `noStyle` removes it.
- `<ConsentBanner class="…">` now reaches the Privacy Choices banner root, merged with the `consentBanner` theme slot, also under `noStyle`.
- When the visitor's system asks for reduced motion, the banner leaves at once, even if you set `disableAnimation: false`.
- If the banner's options fail to download, they download again the next time the banner shows or the visitor presses Customize. Before, a side Drawer stayed empty.
- The receipt and the rights row render the opt-out data the server used, then switch to this browser's data after hydration, so SvelteKit hydrates without a mismatch.

Dialog:

- `<ConsentDialog showTrigger />` shows the floating trigger, and `ConsentDialog` hosts an opt-in confirmation when no banner is on the page.
- An opt-out from a one-click "Do Not Sell" control opens the Privacy Choices dialog with focus on its receipt. A standalone `<OptOutConfirmation />` you mounted still shows itself, and a dialog whose `models` leave out the policy's model shows the classic confirmation.
- New stock `PrivacyChoicesLink`. On an opt-out policy it is the opt-out link from `presentation.optOutLink`, with the opt-out icon beside the Privacy Choices titles. On the Privacy Choices design it also shows under opt-in policies, in the US and the EU, as "Your Privacy Choices" without the icon, so visitors always have a way back into the dialog. Focus returns to it, or to the dialog trigger, when the dialog's opener is gone.
- `<ConsentDialog open />` now opens the dialog through the consent manager: the banner hands over to it, and phone sheets and Esc work. Close and Esc close it; set `open` to `false` and back to `true` to open it again. `open={false}` hides it. Setting `open` to `false` while the dialog shows closes it as Close does, so an unanswered banner comes back. Under `open={false}`, an opt-out confirmation shows on its own instead of opening a dialog that stays hidden.
- A phone sheet closed and reopened quickly stays open. On desktop, under reduced motion or in a closed dialog, a closing sheet goes at once.
- An opt-in policy without a US marker (the `opt-out` right or a GPC rule) always gets the EU dialog, whatever its prompt.
- Phone sheets take the prompt's resolved phone edge style. A Card is always inset, so a Card prompt with `edgeStyle: 'flush'` now gives inset sheets.
- Chevrons that point to a sheet mirror on right-to-left pages, and the dialog sets `dir` from its language.
- `disableAnimation` on `ConsentDialog` now stops the dialog's motion: the backdrop, the card and phone sheets show at once, and the root gets `data-animation="off"`, as on the banner.
- If the design changes to Privacy Choices while the dialog is open, the Privacy Choices dialog now loads and shows.
- `<ConsentDialog open />` opens the dialog once each time `open` turns `true`. A dialog the visitor closed no longer opens again on its own when it mounts again while `open` stays `true`.
- The dialog root carries `data-inth-surface="dialog"` and takes the `consentDialog` theme slot, as the classic dialog does. Phone sheets leave at once when the visitor's system asks for reduced motion.
- A vendor table opened just before the dialog closes no longer schedules a scroll after the dialog is gone.
- `PrivacyChoicesLink` gives the opt-out icon its own size (14px tall), so the icon does not show at full SVG size on pages that do not load the classic banner styles. `noStyle` leaves it unsized.
- `legalLinks` on `ConsentDialog` now applies to the Privacy Choices dialog's footer link (the Cookie Policy in the EU, the Privacy Policy in the US): `null` hides it, and a list shows it only when its key is in the list.
