---
packages:
  "group:sdk": patch
---

Astro's `<ConsentDialogLink />` without children now reads as the dialog's title, as React's does, instead of rendering an empty, zero-size button.
