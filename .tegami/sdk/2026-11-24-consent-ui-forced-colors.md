---
packages:
  "group:sdk": patch
---

### The consent UI works in forced colours (Windows High Contrast)

- The switches in the dialog, the prompt and `ConsentWidget` are drawn in system colours. They used to be invisible, on or off, because forced colours drop the backgrounds they were drawn with.
- A focused button shows an outline. Its focus ring was a shadow, which forced colours also drop.
- The dialog, the opt-in confirmation and the selected "Opt out" or "Allow" option get an outline in place of their shadow edge.
