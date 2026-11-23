---
packages:
  "group:sdk": patch
---

### Vue and Nuxt: the consent banner fixes React already has

- **Taps made before the page hydrates:**
  - The banner shows again if the consent engine fails to load after a tap. Before, it stayed hidden.
  - A tap on the notice's "Do not sell or share my data" link now expands the rights in place, as a tap after hydration does.
  - The banner root has `data-model` and `data-prompt`. A tap is dropped if the policy the page resolves is a different one from the policy the visitor saw.
  - Allow, Don't allow and OK record the time of the tap, not the time the page hydrated.
- **The page status region is there sooner.** The banner's `consent-banner-announcement` region now renders as soon as a choice is owed, before the chunk of the banner's container arrives. It still keeps its node after the banner leaves.
- **`ConsentDialogLink right="opt-out"`** gives the California opt-out icon its own size, as `PrivacyChoicesLink` does. On a page whose stylesheet doesn't size the icon, it no longer fills the line.
