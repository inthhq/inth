---
packages:
  "group:sdk": patch
---

### React: the Privacy Choices dialog root and the opt-out icon

This applies when you use `design: 'privacy-choices'` (or set `presentation.prompt.container`).

- The dialog root now has `data-inth-surface="dialog"`, as the classic dialog has, so CSS and scripts that look for a consent surface find it.
- The `consentDialog` theme slot (`components.dialog.container`) now styles the dialog root, as it styles the classic dialog. With `noStyle` on that slot, the root loses the stock backdrop and keeps only your class.
- The California opt-out icon in `PrivacyChoicesLink` now has its own size, 30 × 14 pixels. Before, a page with the new design loaded no stylesheet for the icon, and it grew to fill the line. With `noStyle`, the icon has no size, so your CSS sets it.
