---
packages:
  "group:sdk": patch
---

### Angular: early taps, the opt-out icon and the dialog description slot

- The banner root carries `data-model` and `data-prompt` again. A tap on the server-rendered banner before the app hydrates is replayed only against the policy the visitor saw.
- A tap on the notice's "Do not sell or share my data" before the app hydrates now opens the rights in place once it does.
- A choice or an OK tapped before the app hydrated is recorded at the time of the tap, not when the app replays it. `ConsentManager.dismissNotice()` takes an optional `{ actionAt }` for the same purpose.
- If the consent engine fails to load after such a tap, the banner shows again instead of staying hidden.
- `[inthConsentDialogLink]` gives its opt-out icon its own width and height, as `<inth-privacy-choices-link>` does, so the icon no longer fills the line on a page without the legal-links stylesheet. Under `noStyle` the icon stays unsized.
- The `consentDialogDescription` theme slot now styles the dialog's intro line.
