---
packages:
  "group:sdk": patch
---

### Angular: the consent banner renders in a Card, a Banner or a Drawer, with the "Your Privacy Choices" dialog

The stock `<inth-consent-banner>` and `<inth-consent-dialog>` in `@inth/angular` now render the same consent UI as `@inth/react`. Keep both components on your page as before.

The banner:

- Shows as a Card, a Banner or a Drawer, as set by its `container` input or `presentation.prompt.container`. Phones (640px and narrower) use `container.phone`; the server renders the desktop layout.
- Customize opens the options in place. A side Drawer shows them from the start and has no Customize. Esc folds the options back and never dismisses the banner.
- The US banners show the "Selling, sharing and targeted ads" control. Opting out applies at once; allowing again asks for a confirmation first.
- `blockUntilChoice` (and a centred Card) blocks the page until a choice. The US notice never blocks.
- After a choice, the outcome is announced and focus moves to your "Your Privacy Choices" control: an element with `data-testid="privacy-choices-link"`, `<inth-consent-dialog-trigger>`, or a `[inthConsentDialogLink]`.

The dialog shows the rights, the receipt and Preferences in the US, and the cookie categories with a staged Save in the EU. On phones, Preferences and EU vendor lists open as sheets over it. It takes `open`, `noStyle`, `disableAnimation`, `legalLinks`, `showTrigger` and `models`.

Each part loads only when needed. The banner loads the code and stylesheet of the one container it shows when a choice is owed, the options load on Customize, and the dialog loads when it opens or when a control that opens it is hovered or focused.

The theme slots `consentBannerExpand`, `consentBannerRightsRow`, `consentBannerSaveButton` and the `consentDialog*` slots for the dialog parts (`consentDialogFooter`, `consentDialogRightsRow`, `consentDialogReceipt` and so on) style the new parts. `noStyle` removes their stock styles. The banner's text inputs (`heading`, `description` and the button texts) apply to every container.
