---
packages:
  "group:sdk": patch
---

### Svelte and SvelteKit: fixes to the consent banner and dialog

- **Taps made before the page hydrates:**
  - The banner shows again if the consent engine fails to load after a tap. Before, it stayed hidden.
  - The banner root carries `data-model` and `data-prompt` again, so the breaking change's note that it no longer does is wrong for these two. A tap is dropped if the policy the page resolves is a different one from the policy the visitor saw.
  - The notice's "Do not sell or share my data" link carries `data-action="customize"`, so a tap on it before hydration expands the rights in place, as a tap after hydration does.
  - Allow, Don't allow and OK record the time of the tap, not the time the page hydrated.
- **Theme slots:** `consentBannerRightLink` now styles the notice's "Do not sell or share my data" link, and `consentDialogDescription` styles the dialog's intro, as in React.
- **`ConsentDialogLink right="opt-out"`** gives the California opt-out icon its own size, as `PrivacyChoicesLink` does. On a page whose stylesheet doesn't size the icon, it no longer fills the line. Under the provider's `noStyle` it stays unsized.
