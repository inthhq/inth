---
packages:
  "group:sdk": patch
---

### React: the "Your Privacy Choices" dialog

The stock React `ConsentDialog` now opens the "Your Privacy Choices" dialog. Keep `<ConsentDialog />` on your page as before; "Your Privacy Choices" and your own settings link open it.

What the dialog shows:

- **US:** "Selling, sharing and targeted ads" as an Opt out | Allow control on the first view. Opting out applies at once. Allowing again asks for a confirmation first. Under a Global Privacy Control signal, Allow is unavailable and a note explains why. Below it, a receipt line ("Saved for this browser · date") with Details and a reference to copy, then Preferences with the cookie categories. Category changes apply at once, and Advertising follows the sale choice. The footer has only Done.
- **EU:** the cookie categories with their vendors. Reject all and Accept all have equal weight. Save choices is enabled only when something changed. Closing without saving discards the changes.
- **Vendors:** each category has a "View N vendors" row that opens a table with each vendor's purpose, privacy policy link and switch. Clicking a category's or vendor's name toggles its switch.
- **Phones (640px and narrower):** Preferences and EU vendor lists open as sheets over the dialog, at most two layers. Esc, ×, Done or a tap outside closes only the top sheet. `edgeStyle` also applies to these sheets.
- Focus moves to the dialog's title when it opens and returns to the link that opened it when it closes. The page behind it is inert. Each layer announces its own changes to screen readers.

The dialog's code and stylesheet load when it opens, or earlier when the visitor hovers or focuses a link that opens it. They are not part of the banner's first load.

The banner's options now list vendors too, and US Preferences in the banner shows the read-only Advertising row.

New `components` parts: `dialog.footer`, `dialog.rightsRow`, `dialog.receipt`, `dialog.preferencesRow`, `dialog.categoryGroup`, `dialog.vendorTable`, `dialog.sheet`, `dialog.doneButton` and `dialog.saveButton`, with the matching theme slots (`consentDialogFooter`, `consentDialogRightsRow` and so on). `dialog.root`, `dialog.card`, `dialog.header`, `dialog.title` and `dialog.content` style the matching parts of the dialog, and `noStyle` removes its styles.

`@inth/sdk/translations` adds English `privacyChoices` keys for the dialog, such as `dialogTitle`, `done`, `receiptSavedBrowser` and `vendorsView`. New builders in `@inth/sdk/surface-state` fill them in: `resolvePrivacyChoicesDialogCopy`, `resolveRightsReceiptCopy`, `resolveVendorTableCopy`, `resolveSaleAnnouncement`, `resolveSwitchAnnouncement` and `resolveAdvertisingRowCopy`. `resolveRightsReceipt`, `planCategorySwitch` and `planVendorSwitch` describe the receipt and how category and vendor switches move together.

Fixed in the banner: the site-name fallback ("This site") is capitalised wherever it starts a sentence, "Do not sell or share my data" reads as a link in both light and dark mode, and each category's description is shown smaller and muted under its name.
