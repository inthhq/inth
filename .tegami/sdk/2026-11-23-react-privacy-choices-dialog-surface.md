---
packages:
  "group:sdk": patch
---

### React: the Privacy Choices dialog root and the opt-out icon

- The dialog root now has `data-inth-surface="dialog"`, so CSS and scripts that look for a consent surface find it.
- The `consentDialog` theme slot (`components.dialog.container`) now styles the dialog root. With `noStyle` on that slot, the root loses the stock backdrop and keeps only your class.
- The California opt-out icon in `PrivacyChoicesLink` now has its own size, 30 × 14 pixels. Before, the page loaded no stylesheet for the icon, and it grew to fill the line. With `noStyle`, the icon has no size, so your CSS sets it.
