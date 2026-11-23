---
packages:
  "group:sdk": patch
---

### React, Next.js, TanStack Start, Vue and Nuxt: focus after the floating trigger opens the dialog

- Closing the "Your Privacy Choices" dialog that the floating `ConsentDialogTrigger` opened now moves focus back to a page control, such as the trigger or "Your Privacy Choices", instead of leaving it on the page body. The trigger hides while the dialog is open, so the dialog had no opener to return focus to.
- React: Escape closes the dialog as soon as focus is in it. An Escape pressed right after the dialog opened was sometimes ignored.
