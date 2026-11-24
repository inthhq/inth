---
packages:
  "group:sdk": patch
---

### Astro: a tap on a prerendered page retries a failed consent chunk

- On a prerendered page, which has no early-tap script, a tap on the banner after the engine or prompt failed to load now retries the load. Before, the tap did nothing.

### React, Vue, Svelte and Angular: the dialog returns focus to an opener inside a shadow root

- When a button inside an open shadow root (a web component) opened the preferences dialog, closing it sent focus to a fallback on the page, because the dialog recorded the shadow host as its opener. It now records the focused button itself and returns focus to it.
