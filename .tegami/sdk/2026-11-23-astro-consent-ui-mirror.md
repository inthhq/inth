---
packages:
  "group:sdk": patch
---

### Astro: early taps keep their time, the opt-out icon on `ConsentDialogLink` is sized, and the notice's opt-out link takes its slot

- **A tap on the server-rendered prompt before its code loaded now records the time of the tap.** Allow, Don't allow and the notice's OK used to record the time the prompt replayed the tap, which could be seconds later. The consent record now carries when the visitor chose, as in React.
- **`<ConsentDialogLink right="opt-out" />` sizes its "Your Privacy Choices" icon.** On a page that loads no stylesheet for it, the CCPA icon is now 14px tall, as on `<PrivacyChoicesLink />`. Under `noStyle` it stays unsized, so your CSS sizes it.
- **`theme.slots.consentBannerRightLink` now applies in Astro.** The notice's opt-out link takes the slot's class and style, after its stock class, on the server-rendered prompt and on the one the browser renders.
- **Astro with `ui: 'svelte'`: the IAB dialog's purposes, features and vendors open collapsed again.** The client links the primitives stylesheet the Svelte IAB dialog renders its rows with, which an earlier change in this release stopped linking. A site with `styles: false` still imports `@inth/astro/primitives.css` itself.
